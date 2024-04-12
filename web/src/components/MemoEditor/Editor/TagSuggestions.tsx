import classNames from "classnames";
import type Codemirror from "codemirror";
import Fuse from "fuse.js";
import { debounce } from "lodash-es";
import { useRef, useState, useEffect } from "react";
import OverflowTip from "@/components/kit/OverflowTip";
import { useTagStore } from "@/store/module";

type Props = {
  editor: Codemirror.Editor | null;
};

type Position = { left: number; top: number; bottom: number };

const TagSuggestions = ({ editor }: Props) => {
  const [position, setPosition] = useState<Position | null>(null);
  const hide = () => setPosition(null);

  const { state } = useTagStore();
  const tagsRef = useRef(state.tags);
  tagsRef.current = state.tags;

  const [selected, setSelected] = useState(0);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const getCurrentWord = (): [word: string] => {
    if (!editor) return [""];
    const position = editor.getCursor();
    const lineContent = editor.getLine(position.line);
    const before = lineContent.slice(0, position.ch).match(/\S*$/) || { 0: "", index: position.ch };
    const after = lineContent.slice(position.ch).match(/^\S*/) || { 0: "" };
    return [before[0] + after[0]];
  };

  const suggestionsRef = useRef<string[]>([]);
  suggestionsRef.current = (() => {
    const search = getCurrentWord()[0].slice(1).toLowerCase();
    const fuse = new Fuse(tagsRef.current);
    return fuse.search(search).map((result) => result.item);
  })();

  const isVisibleRef = useRef(false);
  isVisibleRef.current = !!(position && suggestionsRef.current.length > 0);

  const autocomplete = (tag: string) => {
    if (!editor) return;
    const [word] = getCurrentWord();
    const toPosition = editor.getCursor();
    const fromPosition = {
      ...toPosition,
      ch: toPosition.ch - word.length,
    };
    editor.replaceRange(`#${tag}`, fromPosition, toPosition);
    hide();
  };

  const handleKeyDown = (instance: Codemirror.Editor, e: KeyboardEvent) => {
    if (!isVisibleRef.current) return;
    const suggestions = suggestionsRef.current;
    const selected = selectedRef.current;
    if (["Escape", "ArrowLeft", "ArrowRight"].includes(e.code)) hide();
    if ("ArrowDown" === e.code) {
      setSelected((selected + 1) % suggestions.length);
      e.preventDefault();
      e.stopPropagation();
    }
    if ("ArrowUp" === e.code) {
      setSelected((selected - 1 + suggestions.length) % suggestions.length);
      e.preventDefault();
      e.stopPropagation();
    }
    if (["Enter", "Tab"].includes(e.code)) {
      autocomplete(suggestions[selected]);
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const handleInput = (instance: Codemirror.Editor) => {
    setSelected(0);
    const [word] = getCurrentWord();
    const position = instance?.getCursor();
    const line = instance?.getLine(position.line);
    const currentChar = line[position.ch + 1];
    const isActive = word.startsWith("#") && currentChar !== "#";
    const cursorCoords = instance.cursorCoords(instance.getCursor(), "local");
    const scrollInfo = instance.getScrollInfo();
    isActive
      ? setPosition({
          ...cursorCoords,
          top: cursorCoords.top - scrollInfo.top + 60,
        })
      : hide();
  };

  const listenersAreRegisteredRef = useRef(false);
  const registerListeners = () => {
    if (!editor || listenersAreRegisteredRef.current) return;
    editor.on("blur", hide);
    editor.on("keydown", handleKeyDown);
    editor.on("inputRead", debounce(handleInput, 300));
    listenersAreRegisteredRef.current = true;
  };
  useEffect(registerListeners, [!!editor]);

  if (!isVisibleRef.current || !position) return null;
  return (
    <div
      className="z-20 p-1 mt-1 -ml-2 absolute max-w-[12rem] gap-px rounded font-mono flex flex-col justify-start items-start overflow-auto shadow bg-zinc-100 dark:bg-zinc-700"
      style={{ left: position.left, top: position.top }}
    >
      {suggestionsRef.current.map((tag, i) => (
        <div
          key={tag}
          onMouseDown={() => autocomplete(tag)}
          className={classNames(
            "rounded p-1 px-2 w-full truncate text-sm dark:text-gray-300 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-800",
            i === selected ? "bg-zinc-300 dark:bg-zinc-600" : "",
          )}
        >
          <OverflowTip>#{tag}</OverflowTip>
        </div>
      ))}
    </div>
  );
};

export default TagSuggestions;
