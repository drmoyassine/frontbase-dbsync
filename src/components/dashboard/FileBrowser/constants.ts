// FileBrowser Constants

export const EDGE_API = import.meta.env.VITE_EDGE_API_URL || '';

export const MIME_TYPE_OPTIONS = [
    { label: 'Images (any)', value: 'image/*' },
    { label: 'PNG Image', value: 'image/png' },
    { label: 'JPEG Image', value: 'image/jpeg' },
    { label: 'GIF Image', value: 'image/gif' },
    { label: 'SVG Image', value: 'image/svg+xml' },
    { label: 'WebP Image', value: 'image/webp' },
    { label: 'PDF Document', value: 'application/pdf' },
    { label: 'JSON Data', value: 'application/json' },
    { label: 'Text File', value: 'text/plain' },
    { label: 'HTML File', value: 'text/html' },
    { label: 'CSV File', value: 'text/csv' },
    { label: 'Video (any)', value: 'video/*' },
    { label: 'MP4 Video', value: 'video/mp4' },
    { label: 'Audio (any)', value: 'audio/*' },
    { label: 'MP3 Audio', value: 'audio/mpeg' },
    { label: 'Archive (ZIP)', value: 'application/zip' },
];

export const PAGE_SIZE = 10;
export const BUCKET_PAGE_SIZE = 5;
