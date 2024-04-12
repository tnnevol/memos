import { Editor, EditorProps } from "bytemd";
import classNames from "classnames";
import React, { useEffect, useRef } from "react";
import "@/less/bytemd.less";

export interface BytemdEditorProps extends EditorProps {
  className?: string;
  onChange?(value: string): void;
}

type El = React.MutableRefObject<HTMLDivElement>;
function BytemdEditor(props: BytemdEditorProps) {
  const { className, onChange } = props;
  const elRef = useRef<HTMLDivElement>(null);
  const edRef = useRef<Editor>();
  const onChangeRef = useRef<BytemdEditorProps["onChange"]>();

  useEffect(() => {
    if (!(elRef as El)?.current) return;
    const editor = new Editor({
      target: (elRef as El)?.current,
      props,
    });

    editor.$on("change", (e: CustomEvent<{ value: string }>) => {
      onChangeRef.current?.(e.detail.value);
    });
    edRef.current = editor;

    return () => {
      editor.$destroy();
    };
  }, [props.placeholder]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    // TODO: performance
    edRef.current?.$set(props);
  }, [props]);

  return (
    <div
      ref={elRef}
      className={classNames("w-full h-full my-1 text-base resize-none overflow-x-hidden overflow-y-auto bg-transparent", className)}
    ></div>
  );
}

export default BytemdEditor;
