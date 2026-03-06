import { Component, Input } from '@angular/core';
import type { UiIssue, PerfIssue, UiIssueSeverity, PerfIssueSeverity } from '../../models/interfaces';

type AnyIssue = UiIssue | PerfIssue;
type AnySeverity = UiIssueSeverity | PerfIssueSeverity;

@Component({
  selector: 'app-issues-list',
  standalone: true,
  template: `
    @if (issues.length === 0) {
      <div class="flex flex-col items-center gap-2 py-6 text-base-content/40">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-success/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <p class="text-sm font-medium text-base-content/50">No issues found</p>
        <p class="text-xs">Great job! Everything looks good.</p>
      </div>
    } @else {
      <div class="flex flex-col gap-2">
        <p class="text-xs text-base-content/40 font-medium uppercase tracking-wider mb-1">{{ issues.length }} issue{{ issues.length !== 1 ? 's' : '' }} found</p>

        @for (issue of issues; track issue.id) {
          <div class="collapse collapse-arrow bg-base-200/50 border border-base-300/60 rounded-xl hover:border-base-300 transition-colors">
            <input type="checkbox" />
            <div class="collapse-title flex items-center gap-2.5 text-sm py-3 min-h-0 pr-10">
              <span [class]="severityBadgeClass(issue.severity)" class="shrink-0">{{ issue.severity }}</span>
              @if (type === 'ui') {
                <span class="badge badge-ghost badge-xs shrink-0">{{ asUi(issue).category }}</span>
              } @else {
                <span class="badge badge-ghost badge-xs shrink-0">{{ asPerf(issue).category }}</span>
              }
              <span class="truncate text-base-content/80">{{ issue.description }}</span>
            </div>
            <div class="collapse-content">
              <div class="flex flex-col gap-3 pt-1 text-sm border-t border-base-300/40 mt-0 pb-1">
                @if (type === 'ui') {
                  <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 mt-3">
                    <span class="text-xs font-semibold text-base-content/40 uppercase tracking-wider pt-0.5">Location</span>
                    <span class="text-base-content/70">{{ asUi(issue).location }}</span>
                    <span class="text-xs font-semibold text-base-content/40 uppercase tracking-wider pt-0.5">Fix</span>
                    <span class="text-base-content/70">{{ asUi(issue).suggestion }}</span>
                  </div>
                } @else {
                  <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 mt-3">
                    @if (asPerf(issue).metric) {
                      <span class="text-xs font-semibold text-base-content/40 uppercase tracking-wider pt-0.5">Metric</span>
                      <span class="text-base-content/70">{{ asPerf(issue).metric }} = {{ asPerf(issue).value }}</span>
                    }
                    <span class="text-xs font-semibold text-base-content/40 uppercase tracking-wider pt-0.5">Fix</span>
                    <span class="text-base-content/70">{{ asPerf(issue).suggestion }}</span>
                  </div>
                }

                @if (issue.codeSnippet) {
                  <pre class="bg-base-300/60 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed border border-base-300/40 mt-1">{{ issue.codeSnippet }}</pre>
                }
              </div>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class IssuesListComponent {
  @Input({ required: true }) issues: AnyIssue[] = [];
  @Input() type: 'ui' | 'perf' = 'ui';

  severityBadgeClass(severity: AnySeverity): string {
    const map: Record<AnySeverity, string> = {
      critical: 'badge badge-error badge-xs font-semibold',
      major: 'badge badge-warning badge-xs font-semibold',
      minor: 'badge badge-info badge-xs font-semibold',
      suggestion: 'badge badge-ghost badge-xs',
    };
    return map[severity] ?? 'badge badge-ghost badge-xs';
  }

  asUi(issue: AnyIssue): UiIssue {
    return issue as UiIssue;
  }

  asPerf(issue: AnyIssue): PerfIssue {
    return issue as PerfIssue;
  }
}
