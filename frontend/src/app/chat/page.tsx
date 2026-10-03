"use client"

import { useEffect, useState } from "react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { PlaceholderBanner } from "@/components/page-header"
import { Chat } from "./components/chat"
import { type Conversation, type Message, type User } from "./use-chat"

import conversationsData from "./data/conversations.json"
import messagesData from "./data/messages.json"
import usersData from "./data/users.json"

/** Placeholder: the template's Chat app, filled with sample binome conversations. */
export default function DeskPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Record<string, Message[]>>({})
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    setConversations(conversationsData as Conversation[])
    setMessages(messagesData as Record<string, Message[]>)
    setUsers(usersData as User[])
  }, [])

  return (
    <BaseLayout title="Binome desk" description="One thread per binome, for nudges and answers." watermark="Desk">
      <PlaceholderBanner
        idea="A thread per binome inside the dashboard. An alert (a candidate not contacted, a form missing) gets a one-click Nudge that opens the binome's thread with the message already written, and the reply stays next to the alert. It replaces side chats and the alert emails nobody answers."
        needs="Decide where messages live (a Messages tab in the Master is the simplest, so the script and the dashboard share them) and whether a nudge also sends an email. Then webRun gets a postMessage action and webState a messages field."
      />
      <Chat conversations={conversations} messages={messages} users={users} />
    </BaseLayout>
  )
}
