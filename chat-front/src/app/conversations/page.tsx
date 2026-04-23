import ProtectedRoute from '@/components/Auth/ProtectedRoute';
import ChatWorkspace from '@/components/chat/ChatWorkspace';

export default function ConversationsPage() {
  return (
    <ProtectedRoute>
      <ChatWorkspace />
    </ProtectedRoute>
  );
}
