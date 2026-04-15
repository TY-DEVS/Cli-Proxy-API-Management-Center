import type { FreeProviderCategory, FreeProviderHealth, FreeProviderStatus, FreeProviderTag } from '@/types/freeProvider';
import styles from '@/pages/FreeProvidersPage.module.scss';

export function ProviderTypeBadge({ type }: { type: FreeProviderCategory }) {
  return <span className={`${styles.badge} ${type === 'free' ? styles.badgeFree : styles.badgeTrial}`}>{type.toUpperCase()}</span>;
}

export function ProviderStatusBadge({ status }: { status: FreeProviderStatus }) {
  const className =
    status === 'active'
      ? styles.badgeActive
      : status === 'error'
        ? styles.badgeError
        : styles.badgeInactive;
  return <span className={`${styles.badge} ${className}`}>{status}</span>;
}

export function ProviderHealthBadge({ health }: { health: FreeProviderHealth }) {
  const className =
    health === 'ok'
      ? styles.badgeActive
      : health === 'slow'
        ? styles.badgeTrial
        : health === 'down'
          ? styles.badgeError
          : styles.badgeInactive;
  return <span className={`${styles.badge} ${className}`}>{health}</span>;
}

export function ProviderTagList({ tags }: { tags: FreeProviderTag[] }) {
  if (!tags.length) return null;
  return (
    <div className={styles.tagList}>
      {tags.map((tag) => (
        <span key={tag} className={`${styles.badge} ${tag === 'limited' ? styles.badgeLimited : styles.badgeMuted}`}>
          {tag.toUpperCase()}
        </span>
      ))}
    </div>
  );
}
