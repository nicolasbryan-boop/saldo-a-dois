import type { Metadata } from 'next';
import { getAppContext } from '@/server/app-context';
import { listMessages } from '@/domains/assistant/service';
import { Chat } from '@/components/app/chat';

export const metadata: Metadata = { title: 'Chat' };
export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const context = await getAppContext();
  const messages = await listMessages(context.db, context.household.id);

  return <Chat initialMessages={messages} />;
}
