import { useEffect } from 'react';

type MetaType = 'checkin' | 'membresia';

const CONFIG: Record<MetaType, { icon: string; manifest: string; title: string }> = {
  checkin: {
    icon: '/icons/checkin-180.png',
    manifest: '/manifest-checkin.json',
    title: 'Check-in CBRio',
  },
  membresia: {
    icon: '/icons/membresia-180.png',
    manifest: '/manifest-membresia.json',
    title: 'Membresia CBRio',
  },
};

function upsertLink(rel: string, href: string) {
  let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
}

function upsertMeta(name: string, content: string) {
  let meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

export function useHomeScreenMeta(type: MetaType) {
  useEffect(() => {
    const cfg = CONFIG[type];
    const prevTitle = document.title;

    upsertLink('apple-touch-icon', cfg.icon);
    upsertLink('manifest', cfg.manifest);
    upsertMeta('apple-mobile-web-app-title', cfg.title);
    document.title = cfg.title;

    return () => {
      document.title = prevTitle;
    };
  }, [type]);
}
