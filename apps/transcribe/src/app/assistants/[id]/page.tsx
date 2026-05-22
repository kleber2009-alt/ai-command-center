import { notFound } from 'next/navigation'
import { getAssistant, assistants } from '@/data/assistants'
import AssistantChat from './AssistantChat'

export function generateStaticParams() {
  return assistants.map((a) => ({ id: a.id }))
}

export default function AssistantPage({ params }: { params: { id: string } }) {
  const assistant = getAssistant(params.id)
  if (!assistant) notFound()
  return (
    <AssistantChat
      id={assistant.id}
      name={assistant.name}
      description={assistant.description}
      icon={assistant.icon}
      buttonText={assistant.buttonText}
      helpText={assistant.helpText}
      starters={assistant.starters}
    />
  )
}
