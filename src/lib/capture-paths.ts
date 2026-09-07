/** Only resolve files inside the app's two capture folders. */
function localPath(value: string): string | null {
  if (!value || value.trim() !== value || /[\0?#\\]/.test(value)) return null;
  let path = value;
  if (path.startsWith('file://')) {
    path = path.slice(7);
    if (path.startsWith('localhost/')) path = path.slice(9);
  } else if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(path)) return null;
  try { path = decodeURIComponent(path); } catch { return null; }
  if (!path.startsWith('/') || /[\0\\]/.test(path)) return null;
  if (path.split('/').some(segment => segment === '..' || segment === '.')) return null;
  // Foundation can return either spelling of the same iOS container.
  if (path.startsWith('/private/var/')) path = path.slice(8);
  return path.replace(/\/+$/, '');
}

const iosCaptureRoot = /^\/var\/mobile\/Containers\/Data\/Application\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/Documents\/(scans|walkthrough-photos)(?:\/|$)/i;

export function resolveCaptureFileUri(savedPath: string, currentRoot: string): string | null {
  const saved = localPath(savedPath);
  const root = localPath(currentRoot);
  if (!saved || !root || !/\/(scans|walkthrough-photos)$/.test(root)) return null;
  let relative = saved.startsWith(`${root}/`) ? saved.slice(root.length + 1) : null;
  if (relative === null) {
    const oldContainer = saved.match(iosCaptureRoot);
    const newContainer = root.match(iosCaptureRoot);
    if (!oldContainer || !newContainer || oldContainer[1] !== newContainer[1]) return null;
    relative = saved.slice(oldContainer[0].length);
  }
  if (!relative || relative.split('/').some(segment => !segment)) return null;
  return `file://${`${root}/${relative}`.split('/').map(encodeURIComponent).join('/')}`;
}
