import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// --- CSS Debug Diagnostics (remove after debugging) ---
function diagnoseCss(): void {
  console.group('%c[FixTrace CSS Diagnostics]', 'color: cyan; font-weight: bold');

  // 1. Check stylesheets loaded
  const sheets = Array.from(document.styleSheets);
  console.log(`Stylesheets loaded: ${sheets.length}`);
  sheets.forEach((s, i) => {
    try {
      const ruleCount = s.cssRules?.length ?? '(blocked)';
      console.log(`  [${i}] href=${s.href ?? '(inline)'} rules=${ruleCount}`);
    } catch {
      console.log(`  [${i}] href=${s.href ?? '(inline)'} rules=(CORS blocked)`);
    }
  });

  // 2. Check data-theme
  const html = document.documentElement;
  console.log(`<html> data-theme="${html.getAttribute('data-theme')}"`);

  // 3. Check DaisyUI CSS variables on :root
  const rootStyles = getComputedStyle(html);
  const cssVars = [
    '--color-base-100', '--color-base-200', '--color-base-300',
    '--color-base-content', '--color-primary', '--color-secondary',
  ];
  console.log('DaisyUI CSS variables:');
  cssVars.forEach(v => {
    const val = rootStyles.getPropertyValue(v).trim();
    console.log(`  ${v}: ${val || '(empty!)'}`);
  });

  // 4. Create a test div and check if Tailwind/DaisyUI classes apply
  const testEl = document.createElement('div');
  testEl.className = 'bg-base-200 text-base-content p-4 rounded-xl flex flex-col min-h-screen';
  testEl.style.position = 'absolute';
  testEl.style.left = '-9999px';
  document.body.appendChild(testEl);
  const testStyles = getComputedStyle(testEl);
  console.log('Test element (bg-base-200 text-base-content p-4 rounded-xl flex flex-col min-h-screen):');
  console.log(`  background-color: ${testStyles.backgroundColor}`);
  console.log(`  color:            ${testStyles.color}`);
  console.log(`  padding:          ${testStyles.padding}`);
  console.log(`  border-radius:    ${testStyles.borderRadius}`);
  console.log(`  display:          ${testStyles.display}`);
  console.log(`  flex-direction:   ${testStyles.flexDirection}`);
  console.log(`  min-height:       ${testStyles.minHeight}`);
  document.body.removeChild(testEl);

  // 5. Check actual app-root element
  const appRoot = document.querySelector('app-root');
  if (appRoot) {
    const firstDiv = appRoot.querySelector('div');
    if (firstDiv) {
      const ds = getComputedStyle(firstDiv);
      console.log(`app-root > div classes: "${firstDiv.className}"`);
      console.log(`  computed bg:     ${ds.backgroundColor}`);
      console.log(`  computed display: ${ds.display}`);
      console.log(`  computed min-h:   ${ds.minHeight}`);
    }
  }

  // 6. Check for CSS @layer support
  console.log(`CSS @layer supported: ${'CSSLayerBlockRule' in window}`);

  // 7. Look for any CSS rules matching bg-base-200
  let bgBase200Found = false;
  sheets.forEach(s => {
    try {
      const rules = s.cssRules;
      if (!rules) return;
      for (let j = 0; j < rules.length; j++) {
        const r = rules[j];
        if (r instanceof CSSStyleRule && r.selectorText?.includes('bg-base-200')) {
          bgBase200Found = true;
          console.log(`  Found .bg-base-200 rule: ${r.selectorText} → bg: ${r.style.backgroundColor}`);
          break;
        }
        // Check inside @layer blocks
        if (r instanceof CSSLayerBlockRule) {
          for (let k = 0; k < r.cssRules.length; k++) {
            const inner = r.cssRules[k];
            if (inner instanceof CSSStyleRule && inner.selectorText?.includes('bg-base-200')) {
              bgBase200Found = true;
              console.log(`  Found .bg-base-200 in @layer "${r.name}": ${inner.selectorText} → bg: ${inner.style.backgroundColor}`);
              break;
            }
          }
          if (bgBase200Found) break;
        }
      }
    } catch { /* CORS */ }
  });
  if (!bgBase200Found) console.warn('  .bg-base-200 rule NOT FOUND in any stylesheet!');

  console.groupEnd();
}

// Run diagnostics after DOM is ready and stylesheets have loaded
if (document.readyState === 'complete') {
  setTimeout(diagnoseCss, 100);
} else {
  window.addEventListener('load', () => setTimeout(diagnoseCss, 100));
}
// --- End CSS Debug Diagnostics ---

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
