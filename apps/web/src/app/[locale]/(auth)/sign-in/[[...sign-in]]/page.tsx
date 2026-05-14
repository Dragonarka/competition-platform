import { SignIn } from '@clerk/nextjs';

// Clerk's <SignIn> needs runtime context; skip static prerender.
export const dynamic = 'force-dynamic';

export default function SignInPage() {
  return <SignIn routing="path" path="/sign-in" />;
}
