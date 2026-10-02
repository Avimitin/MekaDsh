import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiClient, errorMessage, segment, sessionPath } from '../../api/client';
import { useConnection } from '../../connections/context';
import { MediaViewer } from './media/MediaViewer';
import { useBlobUrl } from './media/useBlobUrl';
import css from './ImageAttachment.module.css';

const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'];

const imageExtensions = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['image/bmp', 'bmp'],
]);

async function imageBlob(api: ApiClient, id: string, hash: string, signal: AbortSignal) {
  const blob = await api.blob(sessionPath(id) + '/blobs/' + segment(hash), undefined, signal);
  if (!SUPPORTED_TYPES.includes(blob.type))
    throw new Error('The server returned an unsupported image type.');
  return blob;
}

/**
 * One stored image attachment: the authenticated blob read of
 * GET /v1/sessions/{id}/blobs/{hash} behind an object URL, previewed inline
 * and opened into the media viewer on click. While the bytes are in flight an
 * optimistic in-memory source (a not-yet-saved composer image) previews instead.
 * @param props.sessionId - the owning session.
 * @param props.hash - the blob's content hash.
 * @param props.mediaType - the declared MIME type, used for the download name.
 * @param props.optimisticSrc - in-memory preview shown until the blob arrives.
 */
export function ImageAttachment({
  sessionId,
  hash,
  mediaType,
  optimisticSrc,
}: {
  sessionId: string;
  hash: string;
  mediaType: string;
  optimisticSrc?: string | undefined;
}) {
  const { api, connection } = useConnection();
  const [expanded, setExpanded] = useState(false);
  const image = useQuery({
    queryKey: [connection?.id, connection?.authority, 'attachment', sessionId, hash],
    queryFn: ({ signal }) => {
      if (!api) throw new Error('This image is unavailable.');
      return imageBlob(api, sessionId, hash, signal);
    },
    enabled: Boolean(api && hash),
    // Failed reads recover with the connection; immutable images need no refetch.
    staleTime: (query) => (query.state.data ? 'static' : Infinity),
    gcTime: 0,
    retry: false,
  });
  const url = useBlobUrl(image.data);
  const filename = `attachment.${imageExtensions.get(mediaType) ?? 'png'}`;
  if (image.error)
    return (
      <p className={css.error} role="alert">
        {errorMessage(image.error)}
      </p>
    );
  if (image.data?.type === 'application/octet-stream')
    return (
      <div className={css.unavailable}>
        <p className={css.error}>Image preview unavailable for this format.</p>
        <a className={css.download} href={url} download={filename}>
          Download image
        </a>
      </div>
    );
  const src = url ?? optimisticSrc;
  if (!src) return <p className={css.status}>Loading image…</p>;
  return (
    <>
      <button
        type="button"
        className={css.attachment}
        aria-label="View image"
        onClick={() => setExpanded(true)}
      >
        <img src={src} alt="Conversation attachment" loading="lazy" />
      </button>
      {expanded && (
        <MediaViewer
          src={src}
          alt="Conversation attachment"
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
}
