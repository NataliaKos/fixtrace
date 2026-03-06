import {
  Component,
  Input,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  NgZone,
} from '@angular/core';
import { loadMonaco } from '../monaco-editor/monaco-loader';

declare const monaco: any;

@Component({
  selector: 'app-monaco-diff',
  standalone: true,
  template: `
    <div
      #diffContainer
      class="w-full rounded-lg overflow-hidden border border-base-300/60"
      [style.height]="height"
    ></div>
  `,
})
export class MonacoDiffComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() original = '';
  @Input() modified = '';
  @Input() language = 'typescript';
  @Input() filePath = '';
  @Input() height = '350px';

  @ViewChild('diffContainer', { static: true }) containerRef!: ElementRef<HTMLElement>;

  private diffEditor: any;

  constructor(private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    loadMonaco().then(() => {
      this.zone.runOutsideAngular(() => {
        this.diffEditor = monaco.editor.createDiffEditor(this.containerRef.nativeElement, {
          readOnly: true,
          theme: 'vs-dark',
          automaticLayout: true,
          scrollBeyondLastLine: false,
          fontSize: 13,
          renderSideBySide: true,
          minimap: { enabled: false },
          padding: { top: 8, bottom: 8 },
        });

        this.updateModels();
      });
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.diffEditor) return;
    if (
      changes['original'] ||
      changes['modified'] ||
      changes['language']
    ) {
      this.updateModels();
    }
  }

  private updateModels(): void {
    if (!this.diffEditor) return;

    const originalModel = monaco.editor.createModel(this.original, this.language);
    const modifiedModel = monaco.editor.createModel(this.modified, this.language);

    this.diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });
  }

  ngOnDestroy(): void {
    this.diffEditor?.dispose();
  }
}
