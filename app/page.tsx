'use client'

import { ViewType } from '@/components/auth'
import { AuthDialog } from '@/components/auth-dialog'
import { Chat } from '@/components/chat'
import { ChatInput } from '@/components/chat-input'
import { ChatPicker } from '@/components/chat-picker'
import { ChatSettings } from '@/components/chat-settings'
import { NavBar } from '@/components/navbar'
import { Preview } from '@/components/preview'
import { useAuth } from '@/lib/auth'
import { Message, MessageText, MessageCode, MessageImage, toAISDKMessages, toMessageImage } from '@/lib/messages'
import { LLMModelConfig } from '@/lib/models'
import modelsList from '@/lib/models.json'
import { FragmentSchema, fragmentSchema as schema } from '@/lib/schema'
import { supabase } from '@/lib/supabase'
import templates, { TemplateId } from '@/lib/templates'
import { ExecutionResult } from '@/lib/types'
import { DeepPartial } from 'ai'
import { experimental_useObject as useObject } from 'ai/react'
import { usePostHog } from 'posthog-js/react'
import { SetStateAction, useCallback, useEffect, useState, useMemo } from 'react'
import { useLocalStorage } from 'usehooks-ts'

export default function Home() {
  const [chatInput, setChatInput] = useLocalStorage('chat', '')
  const [files, setFiles] = useState<File[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<'auto' | TemplateId>(
    'auto',
  )
  const [languageModel, setLanguageModel] = useLocalStorage<LLMModelConfig>(
    'languageModel',
    {
      model: 'models/gemini-2.5-flash-preview-05-20',
    },
  )

  const posthog = usePostHog()

  const [result, setResult] = useState<ExecutionResult>()
  const [messages, setMessages] = useState<Message[]>([])
  const [fragment, setFragment] = useState<DeepPartial<FragmentSchema>>()
  const [lastProcessedFragment, setLastProcessedFragment] = useState<DeepPartial<FragmentSchema>>()
  const [currentTab, setCurrentTab] = useState<'code' | 'fragment'>('code')
  const [selectedTab, setSelectedTab] = useState<'code' | 'fragment'>('code')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isAuthDialogOpen, setAuthDialog] = useState(false)
  const [authView, setAuthView] = useState<ViewType>('sign_in')
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const { session, userTeam } = useAuth(setAuthDialog, setAuthView)

  const filteredModels = modelsList.models.filter((model) => {
    // Show all models for pro users
    if (userTeam && userTeam.tier === 'pro') {
      return true
    }
    // For free users, show a selection of popular models
     const freeModels = [
       'claude-3-5-sonnet-latest',
       'claude-3-5-haiku-latest',
       'gpt-4o',
       'gpt-4o-mini',
       'models/gemini-2.5-flash-preview-05-20',
       'models/gemini-2.5-pro-preview-05-06',
       'models/gemini-2.0-flash',
       'models/gemini-1.5-pro',
       'models/gemini-1.5-flash',
       'mistral-large-latest',
       'mistral-small-latest'
     ]
    return freeModels.includes(model.id)
  })

  const currentModel = filteredModels.find(
    (model) => model.id === languageModel.model,
  )
  const currentTemplate =
    selectedTemplate === 'auto'
      ? templates
      : { [selectedTemplate]: templates[selectedTemplate] }
  const lastMessage = messages[messages.length - 1]

  // Stable useObject configuration with comprehensive error handling
  const useObjectConfig = useMemo(() => ({
    api: '/api/chat',
    schema,
    onError: (error: Error) => {
      console.error('useObject error:', error)
      if (error.message.includes('Rate limit')) {
        setIsRateLimited(true)
      }
      setErrorMessage(error.message)
    },
    onFinish: async ({ object: fragment, error }: { object: any; error: Error | undefined }) => {
      if (error) {
        console.error('onFinish error:', error)
        return
      }
      
      if (!fragment) {
        console.log('onFinish: No fragment received')
        return
      }

      try {
        const fragmentString = JSON.stringify(fragment)
        const lastProcessedString = lastProcessedFragment ? JSON.stringify(lastProcessedFragment) : null
        
        // Skip if this is the same fragment we just processed
        if (fragmentString === lastProcessedString) {
          console.log('onFinish: Skipping duplicate fragment')
          return
        }

        console.log('onFinish: Processing new fragment')
        setFragment(fragment)
        setLastProcessedFragment(fragment)
        setCurrentTab('fragment')
        setIsPreviewLoading(true)

        // Execute sandbox API call
        const response = await fetch('/api/sandbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fragment,
            userID: session?.user?.id || 'anonymous',
          }),
        })

        if (response.ok) {
          const result = await response.json()
          setResult(result)
        } else {
          console.error('Sandbox API error:', response.status, response.statusText)
        }

        setIsPreviewLoading(false)

        // Add message only if we don't already have an assistant message
        if (!lastMessage || lastMessage.role !== 'assistant') {
          const content: Array<MessageText | MessageCode | MessageImage> = [
            { type: 'text' as const, text: fragment?.commentary || '' },
            { type: 'code' as const, text: fragment?.code || '' },
          ]

          addMessage({
            role: 'assistant',
            content,
            object: fragment,
          })
        }
      } catch (error) {
        console.error('onFinish processing error:', error)
        setIsPreviewLoading(false)
      }
    },
  }), [session?.user?.id, lastProcessedFragment, lastMessage])

  const { object, submit, isLoading, stop, error } = useObject(useObjectConfig)

  const setMessage = useCallback((message: Partial<Message>, index?: number) => {
    setMessages((previousMessages) => {
      const updatedMessages = [...previousMessages]
      updatedMessages[index ?? previousMessages.length - 1] = {
        ...updatedMessages[index ?? previousMessages.length - 1],
        ...message,
      }
      return updatedMessages
    })
  }, [])

  const addMessage = useCallback(
    (message: Message) => {
      setMessages((previousMessages) => {
        const newMessages = [...previousMessages, message]
        return newMessages
      })
    },
    [],
  )

  // Removed useEffect that was causing circular dependency
  // Message updates are now handled in the onFinish callback

  const handleSubmitAuth = async (supabaseAccessToken: string) => {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ supabaseAccessToken }),
    })

    if (response.ok) {
      setAuthDialog(false)
    }
  }

  const handleSubmit = async (
    chatInput: string,
    currentFiles: File[],
    template: 'auto' | TemplateId,
    model: LLMModelConfig,
  ) => {
    if (isLoading) {
      stop()
      return
    }

    setErrorMessage('')
    setIsRateLimited(false)

    const content: Message['content'] = [
      {
        type: 'text',
        text: chatInput,
      },
    ]

    if (currentFiles.length > 0) {
      const imageContent = await Promise.all(
          currentFiles.map(async (file) => {
            const images = await toMessageImage([file])
            return { type: 'image' as const, image: images[0] }
          }),
        )
      content.push(...imageContent)
    }

    const userMessage: Message = {
      role: 'user',
      content,
    }

    const newMessages = [...messages, userMessage]
    setMessages(newMessages)

    posthog.capture('chat_submit', {
      template,
      model: model.model,
      hasFiles: currentFiles.length > 0,
    })

    submit({
      messages: toAISDKMessages(newMessages),
      template: currentTemplate,
      model: currentModel,
      config: model,
    })
  }

  return (
    <main className="flex h-screen flex-col bg-background">
      <NavBar
        session={session}
        showLogin={() => setAuthDialog(true)}
        signOut={async () => {
          if (supabase) {
            await supabase.auth.signOut()
            window.location.reload()
          }
        }}
        onClear={() => {
          setMessages([])
          setFragment(undefined)
          setResult(undefined)
          setChatInput('')
          setFiles([])
        }}
        canClear={messages.length > 0}
        onSocialClick={(target) => {
          const urls = {
            github: 'https://github.com',
            x: 'https://x.com',
            discord: 'https://discord.com'
          }
          window.open(urls[target], '_blank')
        }}
        onUndo={() => {
          if (messages.length > 0) {
            setMessages(messages.slice(0, -1))
          }
        }}
        canUndo={messages.length > 0}
      />
      <div className="flex flex-1 overflow-hidden max-w-7xl mx-auto w-full">
        <div className="flex flex-1 overflow-hidden">
          <div className={`flex flex-col ${(fragment || result) ? 'w-1/5' : 'w-full'}`}>
            <div className="flex-1 overflow-hidden">
              <div className="flex justify-center px-4">
                <div className="w-full max-w-2xl">
                  <Chat
                    messages={messages}
                    isLoading={isLoading}
                    setCurrentPreview={(preview) => {
                      setFragment(preview.fragment)
                      setResult(preview.result)
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-center">
              <div className="w-full max-w-2xl border-t">
                <div className="flex items-center justify-center border-b p-2">
                  <div className="flex items-center justify-center gap-2">
                    <ChatPicker
                      templates={templates}
                      selectedTemplate={selectedTemplate}
                      onSelectedTemplateChange={setSelectedTemplate}
                      models={filteredModels}
                      languageModel={languageModel}
                      onLanguageModelChange={setLanguageModel}
                    />
                    <ChatSettings
                      apiKeyConfigurable={true}
                      baseURLConfigurable={true}
                      languageModel={languageModel}
                      onLanguageModelChange={setLanguageModel}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-center p-4">
              <div className="w-full max-w-2xl">
                <ChatInput
                  retry={() => {}}
                  isErrored={!!errorMessage}
                  errorMessage={errorMessage}
                  isLoading={isLoading}
                  isRateLimited={isRateLimited}
                  stop={stop}
                  input={chatInput}
                  handleInputChange={(e) => setChatInput(e.target.value)}
                  handleSubmit={(e) => {
                    e.preventDefault()
                    handleSubmit(chatInput, files, selectedTemplate, languageModel)
                    setChatInput('')
                    setFiles([])
                  }}
                  isMultiModal={true}
                  files={files}
                  handleFileChange={setFiles}
                >
                  <div />
                </ChatInput>
              </div>
            </div>
          </div>
          {(fragment || result) && (
            <div className="flex w-4/5 flex-col border-l">
              <Preview
                teamID={session?.user?.user_metadata?.team_id}
                accessToken={session?.access_token}
                selectedTab={selectedTab}
                onSelectedTabChange={setSelectedTab}
                isChatLoading={isLoading}
                isPreviewLoading={isLoading}
                fragment={fragment}
                result={result}
                onClose={() => {
                  setFragment(undefined)
                  setResult(undefined)
                }}
              />
            </div>
          )}
        </div>
      </div>
      {supabase && (
        <AuthDialog
          open={isAuthDialogOpen}
          setOpen={setAuthDialog}
          supabase={supabase}
          view={authView}
        />
      )}
      <footer className="border-t bg-muted/30 py-4 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Build your dream app
          </p>
        </div>
      </footer>
    </main>
  )
}
