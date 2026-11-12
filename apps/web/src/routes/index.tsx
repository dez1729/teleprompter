import { createFileRoute } from '@tanstack/react-router'
import { Prompter } from '@/prompter/Prompter'

export const Route = createFileRoute('/')({ component: Prompter })
