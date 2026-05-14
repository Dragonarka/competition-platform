'use client';

import { Check, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export function ShareLinkButton() {
  const t = useTranslations('Common');
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // user cancelled or clipboard unavailable
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      {copied ? <Check /> : <Share2 />}
      {copied ? t('copied') : t('share')}
    </Button>
  );
}
