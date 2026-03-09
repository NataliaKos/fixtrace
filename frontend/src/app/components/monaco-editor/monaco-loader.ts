let monacoLoaded = false;
let monacoLoadPromise: Promise<void> | null = null;

export function loadMonaco(): Promise<void> {
  if (monacoLoaded) return Promise.resolve();
  if (monacoLoadPromise) return monacoLoadPromise;

  monacoLoadPromise = new Promise<void>((resolve, reject) => {
    if (typeof (window as any).monaco !== 'undefined') {
      monacoLoaded = true;
      resolve();
      return;
    }

    const vsBase = `${window.location.origin}/assets/monaco/vs`;

    // Load Monaco CSS dynamically (not in global bundle to avoid @layer conflicts with Tailwind)
    if (!document.querySelector('link[data-monaco-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${vsBase}/editor/editor.main.css`;
      link.setAttribute('data-monaco-css', 'true');
      document.head.appendChild(link);
    }
    // workerMain.js constructs the loader URL as:  baseUrl + "vs/loader.js"
    // So baseUrl must be the PARENT of vs/, i.e. .../assets/monaco/ (not .../assets/monaco/vs/).
    // Then AMD module "vs/language/typescript/tsWorker" resolves to baseUrl + that path = correct URL.
    const workerBaseUrl = `${window.location.origin}/assets/monaco/`;

    const onAmdLoader = () => {
      // workerMain.js is Monaco's universal worker host. It reads self.MonacoEnvironment.baseUrl
      // (in the worker scope) to configure its AMD loader with absolute paths, then waits for a
      // message from the main thread telling it which language module to load.
      //
      // We must set self.MonacoEnvironment.baseUrl INSIDE the worker (not on window), so we
      // create a Blob worker that sets it first, then importScripts workerMain.js.
      // All URLs are absolute (window.location.origin prefix) so they resolve in WorkerGlobalScope.
      (window as any).MonacoEnvironment = {
        getWorker(_workerId: string, _label: string): Worker {
          const src =
            `self.MonacoEnvironment = { baseUrl: '${workerBaseUrl}' };` +
            `importScripts('${vsBase}/base/worker/workerMain.js');`;
          const blob = new Blob([src], { type: 'application/javascript' });
          return new Worker(URL.createObjectURL(blob));
        },
      };

      (window as any).require.config({ paths: { vs: vsBase } });
      (window as any).require(['vs/editor/editor.main'], () => {
        monacoLoaded = true;
        resolve();
      });
    };

    if ((window as any).require) {
      onAmdLoader();
      return;
    }

    const script = document.createElement('script');
    script.src = `${vsBase}/loader.js`;
    script.onload = onAmdLoader;
    script.onerror = () => reject(new Error('Failed to load Monaco loader'));
    document.head.appendChild(script);
  });

  return monacoLoadPromise;
}
