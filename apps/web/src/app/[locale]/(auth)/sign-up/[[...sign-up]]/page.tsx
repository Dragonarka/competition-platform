import { SignUp } from '@clerk/nextjs';

// Symmetric with sign-in; avoid static prerender for Clerk's runtime context.
export const dynamic = 'force-dynamic';

export default function SignUpPage() {
  return <SignUp routing="path" path="/sign-up" />;
}
