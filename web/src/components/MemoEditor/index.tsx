import { Select, Option, Button, IconButton, Divider } from "@mui/joy";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import useLocalStorage from "react-use/lib/useLocalStorage";
import { memoServiceClient } from "@/grpcweb";
import { UNKNOWN_ID } from "@/helpers/consts";
import useCurrentUser from "@/hooks/useCurrentUser";
import { useGlobalStore, useResourceStore, useTagStore } from "@/store/module";
import { useMemoStore, useUserStore } from "@/store/v1";
import { MemoRelation, MemoRelation_Type } from "@/types/proto/api/v2/memo_relation_service";
import { Memo, Visibility } from "@/types/proto/api/v2/memo_service";
import { Resource } from "@/types/proto/api/v2/resource_service";
import { UserSetting } from "@/types/proto/api/v2/user_service";
import { useTranslate } from "@/utils/i18n";
import { convertVisibilityFromString, convertVisibilityToString } from "@/utils/memo";
import { getResourceUrl } from "@/utils/resource";
import { extractTagsFromContent } from "@/utils/tag";
import showCreateResourceDialog from "../CreateResourceDialog";
import Icon from "../Icon";
import VisibilityIcon from "../VisibilityIcon";
import AddMemoRelationButton from "./ActionButton/AddMemoRelationButton";
import MarkdownMenu from "./ActionButton/MarkdownMenu";
import TagSelector from "./ActionButton/TagSelector";
import Editor, { EditorRefActions } from "./Editor";
import RelationListView from "./RelationListView";
import ResourceListView from "./ResourceListView";
import { MemoEditorContext } from "./types";

interface Props {
  className?: string;
  editorClassName?: string;
  cacheKey?: string;
  memoId?: number;
  parentMemoId?: number;
  relationList?: MemoRelation[];
  autoFocus?: boolean;
  onConfirm?: (memoId: number) => void;
}

interface State {
  memoVisibility: Visibility;
  resourceList: Resource[];
  relationList: MemoRelation[];
  isUploadingResource: boolean;
  isRequesting: boolean;
  isComposing: boolean;
}

const MemoEditor = (props: Props) => {
  const { className, editorClassName, cacheKey, memoId, parentMemoId, autoFocus, onConfirm } = props;
  const { i18n } = useTranslation();
  const t = useTranslate();
  const {
    state: { systemStatus },
  } = useGlobalStore();
  const userStore = useUserStore();
  const memoStore = useMemoStore();
  const resourceStore = useResourceStore();
  const tagStore = useTagStore();
  const currentUser = useCurrentUser();
  const [state, setState] = useState<State>({
    memoVisibility: Visibility.PRIVATE,
    resourceList: [],
    relationList: props.relationList ?? [],
    isUploadingResource: false,
    isRequesting: false,
    isComposing: false,
  });
  const [hasContent, setHasContent] = useState<boolean>(false);
  const editorRef = useRef<EditorRefActions>(null);
  const userSetting = userStore.userSetting as UserSetting;
  const contentCacheKey = `${currentUser.name}-${cacheKey || ""}`;
  const [contentCache, setContentCache] = useLocalStorage<string>(contentCacheKey, "");
  const referenceRelations = memoId
    ? state.relationList.filter(
        (relation) => relation.memoId === memoId && relation.relatedMemoId !== memoId && relation.type === MemoRelation_Type.REFERENCE,
      )
    : state.relationList.filter((relation) => relation.type === MemoRelation_Type.REFERENCE);

  // 初始化缓存内容
  useEffect(() => {
    editorRef.current?.setContent(contentCache || "");
  }, []);

  useEffect(() => {
    if (autoFocus) {
      handleEditorFocus();
    }
  }, [autoFocus]);

  useEffect(() => {
    let visibility = userSetting.memoVisibility;
    if (systemStatus.disablePublicMemos && visibility === "PUBLIC") {
      visibility = "PRIVATE";
    }
    setState((prevState) => ({
      ...prevState,
      memoVisibility: convertVisibilityFromString(visibility),
    }));
  }, [userSetting.memoVisibility, systemStatus.disablePublicMemos]);

  useEffect(() => {
    if (memoId) {
      memoStore.getOrFetchMemoById(memoId ?? UNKNOWN_ID).then((memo) => {
        if (memo) {
          handleEditorFocus();
          setState((prevState) => ({
            ...prevState,
            memoVisibility: memo.visibility,
            resourceList: memo.resources,
            relationList: memo.relations,
          }));
          if (!contentCache) {
            editorRef.current?.setContent(memo.content ?? "");
          }
        }
      });
    }
  }, [memoId]);

  const handleCompositionStart = () => {
    setState((prevState) => ({
      ...prevState,
      isComposing: true,
    }));
  };

  const handleCompositionEnd = () => {
    setState((prevState) => ({
      ...prevState,
      isComposing: false,
    }));
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!editorRef.current) {
      return;
    }

    const isMetaKey = event.ctrlKey || event.metaKey;
    if (isMetaKey) {
      if (event.key === "Enter") {
        handleSaveBtnClick();
        return;
      }
    }
  };

  const handleMemoVisibilityChange = (visibility: Visibility) => {
    setState((prevState) => ({
      ...prevState,
      memoVisibility: visibility,
    }));
  };

  const handleUploadFileBtnClick = () => {
    showCreateResourceDialog({
      onConfirm: (resourceList) => {
        setState((prevState) => ({
          ...prevState,
          resourceList: [...prevState.resourceList, ...resourceList],
        }));
      },
    });
  };

  const handleSetResourceList = (resourceList: Resource[]) => {
    setState((prevState) => ({
      ...prevState,
      resourceList,
    }));
  };

  const handleSetRelationList = (relationList: MemoRelation[]) => {
    setState((prevState) => ({
      ...prevState,
      relationList,
    }));
  };

  const handleUploadResource = async (file: File) => {
    setState((state) => {
      return {
        ...state,
        isUploadingResource: true,
      };
    });

    let resource = undefined;
    try {
      resource = await resourceStore.createResourceWithBlob(file);
    } catch (error: any) {
      console.error(error);
      toast.error(typeof error === "string" ? error : error.response.data.message);
    }

    setState((state) => {
      return {
        ...state,
        isUploadingResource: false,
      };
    });
    return resource;
  };

  const uploadMultiFiles = async (files: FileList) => {
    const uploadedResourceList: Resource[] = [];
    for (const file of files) {
      const resource = await handleUploadResource(file);
      if (resource) {
        uploadedResourceList.push(resource);
        if (memoId) {
          await resourceStore.updateResource({
            resource: Resource.fromPartial({
              id: resource.id,
              memoId,
            }),
            updateMask: ["memo_id"],
          });
        }
      }
    }
    if (uploadedResourceList.length > 0) {
      setState((prevState) => ({
        ...prevState,
        resourceList: [...prevState.resourceList, ...uploadedResourceList],
      }));
    }
  };

  const handleDropEvent = async (event: React.DragEvent) => {
    if (event.dataTransfer && event.dataTransfer.files.length > 0) {
      event.preventDefault();
      await uploadMultiFiles(event.dataTransfer.files);
    }
  };

  const handleUploadImages = async (files: File[]) => {
    const uploadedResourceList: Resource[] = [];
    for (const file of files) {
      const resource = await handleUploadResource(file);
      if (resource) {
        uploadedResourceList.push(resource);
        if (memoId) {
          await resourceStore.updateResource({
            resource: Resource.fromPartial({
              id: resource.id,
              memoId,
            }),
            updateMask: ["memo_id"],
          });
        }
      }
    }
    return uploadedResourceList.map((resource) => ({ url: getResourceUrl(resource, false) }));
  };

  const handleContentChange = (content: string) => {
    setHasContent(content !== "");
    if (content !== "") {
      setContentCache(content);
    } else {
      localStorage.removeItem(contentCacheKey);
    }
  };

  const handleSaveBtnClick = async () => {
    if (state.isRequesting) {
      return;
    }

    setState((state) => {
      return {
        ...state,
        isRequesting: true,
      };
    });
    const content = editorRef.current?.getContent() ?? "";
    try {
      // Update memo.
      if (memoId && memoId !== UNKNOWN_ID) {
        const prevMemo = await memoStore.getOrFetchMemoById(memoId ?? UNKNOWN_ID);
        if (prevMemo) {
          const memo = await memoStore.updateMemo(
            {
              id: prevMemo.id,
              content,
              visibility: state.memoVisibility,
            },
            ["content", "visibility"],
          );
          await memoServiceClient.setMemoResources({
            id: memo.id,
            resources: state.resourceList,
          });
          await memoServiceClient.setMemoRelations({
            id: memo.id,
            relations: state.relationList,
          });
          await memoStore.getOrFetchMemoById(memo.id, { skipCache: true });
          if (onConfirm) {
            onConfirm(memo.id);
          }
        }
      } else {
        // Create memo or memo comment.
        const request = !parentMemoId
          ? memoStore.createMemo({
              content,
              visibility: state.memoVisibility,
            })
          : memoServiceClient
              .createMemoComment({
                id: parentMemoId,
                create: {
                  content,
                  visibility: state.memoVisibility,
                },
              })
              .then(({ memo }) => memo as Memo);
        const memo = await request;
        await memoServiceClient.setMemoResources({
          id: memo.id,
          resources: state.resourceList,
        });
        await memoServiceClient.setMemoRelations({
          id: memo.id,
          relations: state.relationList,
        });
        await memoStore.getOrFetchMemoById(memo.id, { skipCache: true });
        if (onConfirm) {
          onConfirm(memo.id);
        }
      }
      editorRef.current?.setContent("");
    } catch (error: any) {
      console.error(error);
      toast.error(error.details);
    }

    // Batch upsert tags.
    const tags = extractTagsFromContent(content);
    await tagStore.batchUpsertTag(tags);

    setState((state) => {
      return {
        ...state,
        isRequesting: false,
        resourceList: [],
        relationList: [],
      };
    });
  };

  const handleEditorFocus = () => {
    editorRef.current?.focus();
  };

  const editorConfig = useMemo(
    () => ({
      className: editorClassName ?? "",
      initialContent: "",
      placeholder: t("editor.placeholder"),
      onContentChange: handleContentChange,
      uploadImages: handleUploadImages,
    }),
    [i18n.language],
  );

  const allowSave = (hasContent || state.resourceList.length > 0) && !state.isUploadingResource && !state.isRequesting;

  return (
    <MemoEditorContext.Provider
      value={{
        relationList: state.relationList,
        setRelationList: (relationList: MemoRelation[]) => {
          setState((prevState) => ({
            ...prevState,
            relationList,
          }));
        },
        memoId,
      }}
    >
      <div
        className={`${
          className ?? ""
        } relative w-full flex flex-col justify-start items-start bg-white dark:bg-zinc-800 px-4 pt-4 rounded-lg border border-gray-200 dark:border-zinc-700`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onDrop={handleDropEvent}
        onFocus={handleEditorFocus}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      >
        <Editor ref={editorRef} {...editorConfig} />
        <ResourceListView resourceList={state.resourceList} setResourceList={handleSetResourceList} />
        <RelationListView relationList={referenceRelations} setRelationList={handleSetRelationList} />
        <div className="relative w-full flex flex-row justify-between items-center pt-2" onFocus={(e) => e.stopPropagation()}>
          <div className="flex flex-row justify-start items-center opacity-80">
            <TagSelector editorRef={editorRef} />
            <MarkdownMenu editorRef={editorRef} />
            <IconButton size="sm" onClick={handleUploadFileBtnClick}>
              <Icon.Image className="w-5 h-5 mx-auto" />
            </IconButton>
            <AddMemoRelationButton editorRef={editorRef} />
          </div>
        </div>
        <Divider className="!mt-2" />
        <div className="w-full flex flex-row justify-between items-center py-3 dark:border-t-zinc-500">
          <div className="relative flex flex-row justify-start items-center" onFocus={(e) => e.stopPropagation()}>
            <Select
              variant="plain"
              value={state.memoVisibility}
              startDecorator={<VisibilityIcon visibility={state.memoVisibility} />}
              onChange={(_, visibility) => {
                if (visibility) {
                  handleMemoVisibilityChange(visibility);
                }
              }}
            >
              {[Visibility.PRIVATE, Visibility.PROTECTED, Visibility.PUBLIC].map((item) => (
                <Option key={item} value={item} className="whitespace-nowrap">
                  {t(`memo.visibility.${convertVisibilityToString(item).toLowerCase()}` as any)}
                </Option>
              ))}
            </Select>
          </div>
          <div className="shrink-0 flex flex-row justify-end items-center">
            <Button
              disabled={!allowSave}
              loading={state.isRequesting}
              endDecorator={<Icon.Send className="w-4 h-auto" />}
              onClick={handleSaveBtnClick}
            >
              {t("editor.save")}
            </Button>
          </div>
        </div>
      </div>
    </MemoEditorContext.Provider>
  );
};

export default MemoEditor;
