import frontmatter from "@bytemd/plugin-frontmatter";
import gfm from "@bytemd/plugin-gfm";
import highlight from "@bytemd/plugin-highlight";
import { BytemdPlugin, EditorProps } from "bytemd";
import classNames from "classnames";
import Codemirror, { Position } from "codemirror";
import xml from "highlight.js/lib/languages/xml";
import juejinMarkdownThemes from "juejin-markdown-themes";
import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import BytemdEditor, { BytemdEditorProps } from "./BytemdEditor";
import TagSuggestions from "./TagSuggestions";

export interface EditorRefActions {
  focus: FunctionType;
  scrollToCursor: FunctionType;
  insertText: (text: string, prefix?: string, suffix?: string) => void;
  removeText: (fromPosition: Codemirror.Position, toPosition: Codemirror.Position) => void;
  replaceRange: (replacement: string | string[], from: Codemirror.Position, to?: Codemirror.Position) => void;
  setContent: (text: string) => void;
  getContent: () => string;
  getSelectedContent: () => string;
  getCursorPosition: (start?: "from" | "to") => Codemirror.Position;
  setCursorPosition: (anchor: Codemirror.Position, head?: Codemirror.Position) => void;
  getCursorLineNumber: () => number;
  getLine: (lineNumber: number) => string;
  setLine: (lineNumber: number, text: string) => void;
  // 获取光标之前的内容
  getCursorBeforeContent: () => string;
}

interface Props extends Pick<EditorProps, "uploadImages"> {
  className: string;
  initialContent: string;
  placeholder: string;
  tools?: React.ReactNode;
  onContentChange: (content: string) => void;
}
const Editor = forwardRef(function Editor(props: Props, ref: React.ForwardedRef<EditorRefActions>) {
  const { className, initialContent, placeholder, uploadImages, onContentChange } = props;
  // 编辑器的真实内容
  const [realContent, setRealContent] = useState<string>("");
  const [editor, setEditor] = useState<Codemirror.Editor | null>(null);
  const plugins: BytemdPlugin[] = [
    gfm(),
    highlight({
      init(hljs) {
        // You can register additional languages
        hljs.registerLanguage("vue", xml);
      },
    }),
    frontmatter(),
    // 支持皮肤
    {
      viewerEffect({ file }) {
        // mk-cute nicoz-blue channing-cyan awesome-green
        const $style = document.createElement("style");
        // const $link = document.createElement("link");
        const frontmatter = file.frontmatter as any;
        const theme = frontmatter?.theme ?? "qklhk-chocolate";
        // const highlight = frontmatter?.highlight ?? "github";
        // $link.rel = "stylesheet";
        // $link.href = `https://unpkg.com/@highlightjs/cdn-assets@11.9.0/styles/${highlight}.min.css`;
        $style.innerHTML = juejinMarkdownThemes[theme]?.style;
        document.head.appendChild($style);
        // document.head.appendChild($link);
        return () => {
          $style.remove();
          // $link.remove();
        };
      },
    },
    // 获取 codemirror 实例
    {
      editorEffect(ctx) {
        setEditor(ctx.editor);
        // console.log(editor?.replaceRange);
        // codemirror editor instance
        ctx.editor.on("blur", () => {});
        return () => {
          // ctx.editor.off('event', ...)
        };
      },
    },
  ];

  useEffect(() => {
    if (initialContent) {
      setRealContent(initialContent);
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setCursorPosition(anchor: Codemirror.Position, head?: Codemirror.Position) {
        if (!editor) return;
        editor.setSelection(anchor, head);
      },
      setLine(lineNumber: number, text: string) {
        if (!editor) return;
        const line = editor.getLine(lineNumber);
        editor.replaceRange(
          text,
          {
            line: lineNumber,
            ch: 0,
          },
          { line: lineNumber, ch: line.length },
        );
      },
      setContent(content) {
        setRealContent(content);
      },
      // 从光标的位置插入文本
      insertText(content = "", prefix = "", suffix = "") {
        if (!editor) return;
        const position = editor.getCursor();
        position && editor.replaceRange(prefix + content + suffix, position);
      },
      replaceRange(replacement: string | string[], from: Codemirror.Position, to?: Codemirror.Position) {
        if (!editor) return;
        editor.replaceRange(replacement, from, to);
      },
      removeText(fromPosition: Codemirror.Position, toPosition: Codemirror.Position) {
        if (!editor) return;
        editor.replaceRange("", fromPosition, toPosition);
      },
      scrollToCursor() {
        if (!editor) return;
        const position = editor.getCursor();
        editor.scrollIntoView(position);
      },
      focus() {
        editor?.focus();
      },

      getContent() {
        // console.log("getContent", realContent);
        return realContent ?? "";
      },
      getSelectedContent() {
        return editor?.getSelection() ?? "";
      },
      getCursorPosition() {
        if (!editor) return { line: 0, ch: 0 };
        return editor.getCursor();
      },
      getCursorLineNumber() {
        if (!editor) return 0;
        const position = editor.getCursor();
        return position.line ?? 0;
      },
      getLine(lineNumber: number) {
        if (!editor) return "";
        return editor.getLine(lineNumber);
      },
      getCursorBeforeContent() {
        if (!editor) return "";
        const lines = realContent.split("\n");
        const position = editor.getCursor();
        return lines.slice(0, position.line).join("\n") + "\n" + lines[position.line].slice(0, position.ch);
      },
    }),
    [realContent, !!editor],
  );

  const handleEditorInput = (content: string) => {
    setRealContent(content);
    onContentChange(content);
    // console.log("handleEditorInput realContent", realContent);
  };

  const editConfig: BytemdEditorProps = {
    placeholder,
    value: realContent,
    plugins,
    mode: "auto",
    editorConfig: {
      theme: "3024-night",
    },
    onChange: handleEditorInput,
    uploadImages: uploadImages,
  };

  return (
    <div className={classNames("flex flex-col justify-start items-start relative w-full h-auto bg-inherit dark:text-gray-300", className)}>
      <BytemdEditor {...editConfig} />
      <TagSuggestions editor={editor} />
    </div>
  );
});

export default Editor;
