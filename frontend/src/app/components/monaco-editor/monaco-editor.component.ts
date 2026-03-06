import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  NgZone,
} from '@angular/core';
import { loadMonaco } from './monaco-loader';

declare const monaco: any;

@Component({
  selector: 'app-monaco-editor',
  standalone: true,
  template: `
    <div
      #editorContainer
      class="w-full overflow-hidden"
      [style.height]="height"
    ></div>
  `,
})
export class MonacoEditorComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() value = '';
  @Input() language = 'typescript';
  @Input() readOnly = false;
  @Input() minimap = false;
  @Input() height = '350px';
  @Output() valueChange = new EventEmitter<string>();

  @ViewChild('editorContainer', { static: true }) containerRef!: ElementRef<HTMLElement>;

  private editor: any;
  private ignoreChange = false;

  constructor(private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    loadMonaco().then(() => {
      this.zone.runOutsideAngular(() => {
        this.editor = monaco.editor.create(this.containerRef.nativeElement, {
          value: this.value,
          language: this.language,
          readOnly: this.readOnly,
          theme: 'vs-dark',
          minimap: { enabled: this.minimap },
          automaticLayout: true,
          scrollBeyondLastLine: false,
          fontSize: 13,
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          padding: { top: 8, bottom: 8 },
        });

        this.editor.onDidChangeModelContent(() => {
          if (this.ignoreChange) return;
          this.zone.run(() => {
            this.valueChange.emit(this.editor.getValue());
          });
        });
      });
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.editor) return;

    if (changes['value'] && !changes['value'].firstChange) {
      const current = this.editor.getValue();
      if (current !== this.value) {
        this.ignoreChange = true;
        this.editor.setValue(this.value);
        this.ignoreChange = false;
      }
    }

    if (changes['language'] && !changes['language'].firstChange) {
      const model = this.editor.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, this.language);
      }
    }

    if (changes['readOnly'] && !changes['readOnly'].firstChange) {
      this.editor.updateOptions({ readOnly: this.readOnly });
    }
  }

  ngOnDestroy(): void {
    this.editor?.dispose();
  }
}
