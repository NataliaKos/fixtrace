import { Component, Input, Output, EventEmitter, OnChanges, signal } from '@angular/core';
import type { CodeFile } from '../../models/interfaces';

interface FlatNode {
  name: string;
  path: string;
  depth: number;
  isDirectory: boolean;
  visible: boolean;
}

@Component({
  selector: 'app-file-tree',
  standalone: true,
  template: `
    <div class="flex flex-col gap-0.5 text-sm font-mono max-h-[600px] overflow-y-auto pr-1">
      @for (node of visibleNodes(); track node.path) {
        @if (node.isDirectory) {
          <button
            class="flex items-center gap-1.5 py-1 px-2 rounded-md text-base-content/50 hover:text-base-content/80 hover:bg-base-200/60 transition-colors duration-150 text-left w-full"
            [style.padding-left.px]="8 + node.depth * 16"
            (click)="toggleDir(node.path)"
          >
            <svg
              class="w-3.5 h-3.5 shrink-0 transition-transform duration-150"
              [class.rotate-90]="expandedDirs().has(node.path)"
              xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            ><path d="m9 18 6-6-6-6"/></svg>
            <svg class="w-3.5 h-3.5 shrink-0 text-warning/60" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
            <span class="truncate">{{ node.name }}</span>
          </button>
        } @else {
          <button
            class="flex items-center gap-1.5 py-1 px-2 rounded-md transition-colors duration-150 text-left w-full"
            [class]="selectedPath === node.path
              ? 'bg-primary/10 text-primary'
              : 'text-base-content/60 hover:text-base-content/80 hover:bg-base-200/60'"
            [style.padding-left.px]="8 + node.depth * 16"
            (click)="selectFile(node.path)"
          >
            <svg class="w-3.5 h-3.5 shrink-0 text-base-content/30" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
            <span class="truncate">{{ node.name }}</span>
          </button>
        }
      }
    </div>
  `,
})
export class FileTreeComponent implements OnChanges {
  @Input({ required: true }) files: CodeFile[] = [];
  @Input() selectedPath = '';
  @Output() fileSelected = new EventEmitter<string>();

  expandedDirs = signal(new Set<string>());
  private allNodes: FlatNode[] = [];

  visibleNodes = signal<FlatNode[]>([]);

  ngOnChanges(): void {
    this.allNodes = this.buildFlatTree(this.files);
    // Expand all directories by default
    const dirs = new Set<string>();
    for (const node of this.allNodes) {
      if (node.isDirectory) dirs.add(node.path);
    }
    this.expandedDirs.set(dirs);
    this.updateVisible();
  }

  toggleDir(path: string): void {
    const dirs = new Set(this.expandedDirs());
    if (dirs.has(path)) {
      dirs.delete(path);
    } else {
      dirs.add(path);
    }
    this.expandedDirs.set(dirs);
    this.updateVisible();
  }

  selectFile(path: string): void {
    this.fileSelected.emit(path);
  }

  private updateVisible(): void {
    const expanded = this.expandedDirs();
    const visible: FlatNode[] = [];

    for (const node of this.allNodes) {
      // Check if all parent directories are expanded
      const parentParts = node.path.split('/').slice(0, -1);
      let parentPath = '';
      let allParentsExpanded = true;

      for (const part of parentParts) {
        parentPath = parentPath ? `${parentPath}/${part}` : part;
        if (!expanded.has(parentPath)) {
          allParentsExpanded = false;
          break;
        }
      }

      if (node.depth === 0 || allParentsExpanded) {
        visible.push(node);
      }
    }

    this.visibleNodes.set(visible);
  }

  private buildFlatTree(files: CodeFile[]): FlatNode[] {
    const nodes: FlatNode[] = [];
    const dirsSeen = new Set<string>();

    const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));

    for (const file of sortedFiles) {
      const parts = file.path.split('/');

      // Add directory nodes for intermediate paths
      for (let i = 0; i < parts.length - 1; i++) {
        const dirPath = parts.slice(0, i + 1).join('/');
        if (!dirsSeen.has(dirPath)) {
          dirsSeen.add(dirPath);
          nodes.push({
            name: parts[i],
            path: dirPath,
            depth: i,
            isDirectory: true,
            visible: true,
          });
        }
      }

      // Add file node
      nodes.push({
        name: parts[parts.length - 1],
        path: file.path,
        depth: parts.length - 1,
        isDirectory: false,
        visible: true,
      });
    }

    return nodes;
  }
}
