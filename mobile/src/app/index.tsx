import { Redirect } from 'expo-router';

import { useSession } from '@/lib/auth';

export default function Index() {
  const { session } = useSession();
  return <Redirect href={session ? '/dashboard' : '/login'} />;
}
