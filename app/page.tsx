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
import { Message, toAISDKMessages, toMessageImage } from '@/lib/messages'
import { LLMModelConfig } from '@/lib/models'
import modelsList from '@/lib/models.json'
import { FragmentSchema, fragmentSchema as schema } from '@/lib/schema'
import { supabase } from '@/lib/supabase'
import templates, { TemplateId } from '@/lib/templates'
import { ExecutionResult } from '@/lib/types'
import { DeepPartial } from 'ai'
import { experimental_useObject as useObject } from 'ai/react'
import { usePostHog } from 'posthog-js/react'
import { SetStateAction, useCallback, useEffect, useState } from 'react'
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
      model: 'claude-3-5-sonnet-latest',
    },
  )

  const posthog = usePostHog()

  const [result, setResult] = useState<ExecutionResult>()
  const [messages, setMessages] = useState<Message[]>([])
  const [fragment, setFragment] = useState<DeepPartial<FragmentSchema>>()
  const [currentTab, setCurrentTab] = useState<'code' | 'fragment'>('code')
  const [selectedTab, setSelectedTab] = useState<'code' | 'fragment'>('code')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [isAuthDialogOpen, setAuthDialog] = useState(false)
  const [authView, setAuthView] = useState<ViewType>('sign_in')
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const { session, userTeam } = useAuth(setAuthDialog, setAuthView)

  const filteredModels = modelsList.models.filter((model) => {
    return (
      model.id === 'claude-3-5-sonnet-latest' ||
      (userTeam && userTeam.tier === 'pro')
    )
  })

  const currentModel = filteredModels.find(
    (model) => model.id === languageModel.model,
  )
  const currentTemplate =
    selectedTemplate === 'auto'
      ? templates
      : { [selectedTemplate]: templates[selectedTemplate] }
  const lastMessage = messages[messages.length - 1]

  const { object, submit, isLoading, stop, error } = useObject({
    api: '/api/chat',
    schema,
    onError: (error) => {
      if (error.message.includes('Rate limit')) {
        setIsRateLimited(true)
      }
      setErrorMessage(error.message)
    },
    onFinish: async ({ object: fragment, error }) => {
      if (!error && fragment) {
        setFragment(fragment)
        setCurrentTab('fragment')
        setIsPreviewLoading(true)

        try {
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
          }
        } catch (error) {
          console.error('Error running code:', error)
        } finally {
          setIsPreviewLoading(false)
        }
      }

      const content = [
        { type: 'text', text: fragment?.commentary || '' },
        { type: 'code', text: object.code || '' },
      ]

      if (!lastMessage || lastMessage.role !== 'assistant') {
        addMessage({
          role: 'assistant',
          content,
          object,
        })
      }
    },
  })

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
      setMessages((previousMessages) => [...previousMessages, message])
      return previousMessages.length
    },
    [],
  )

  useEffect(() => {
    if (object?.code && lastMessage?.role === 'assistant') {
      setMessage(
        {
          content: [
            { type: 'text', text: object.commentary || '' },
            { type: 'code', text: object.code },
          ],
          object,
        },
        messages.length - 1,
      )
    }
  }, [object, lastMessage, setMessage, messages.length])

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
          const { image, text } = await toMessageImage(file)
          return { type: 'image' as const, image, text }
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
      model,
      config: {
        provider: currentModel?.provider,
      },
    })
  }

  return (
    <main className="flex h-screen flex-col bg-background">
      <NavBar
        session={session}
        showLogin={() => setAuthDialog(true)}
        signOut={async () => {
          await supabase.auth.signOut()
          window.location.reload()
        }}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col">
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-2">
              <ChatPicker
                templates={templates}
                selectedTemplate={selectedTemplate}
                onSelectedTemplateChange={setSelectedTemplate}
              />
              <ChatSettings
                languageModel={languageModel}
                onLanguageModelChange={setLanguageModel}
                models={filteredModels}
              />
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <Chat
              messages={messages}
              isLoading={isLoading}
              setCurrentPreview={(preview) => {
                setFragment(preview.fragment)
                setResult(preview.result)
              }}
            />
          </div>
          <div className="border-t">
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
      {supabase && (
        <AuthDialog
          open={isAuthDialogOpen}
          setOpen={setAuthDialog}
          supabase={supabase}
          view={authView}
        />
      )}
    </main>
  )
}
