"use client";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState, useRef, useLayoutEffect, useMemo, memo } from "react";
import {
  Sparkles,
  Bot,
  Copy,
  Check,
  SlidersHorizontal,
  RotateCcw,
  PencilRuler,
  History,
  Loader2,
  ScanEye,
  LoaderCircle,
  ClipboardCopy,
} from "lucide-react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import copy from "copy-to-clipboard";
import dayjs from "dayjs";
import isToday from "dayjs/plugin/isToday";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import Header from "@/components/header";
import { useSettingStore } from "@/store/setting";
import { useHistoryStore } from "@/store/history";
import modelList from "@/constants/models";
import { uploadMiddleware } from "@/utils/upload";
import { cn } from "@/utils/style";
import { uid } from "radash";

const HistoryItem = dynamic(() => import("@/components/history-item"));
const ImageUploader = dynamic(() => import("@/components/image-uploader"));
const PresetList = dynamic(() => import("@/components/preset-list"), {
  ssr: false,
});

dayjs.extend(isToday);

const PAGE_SIZE = 20;

function Prompt() {
  const t = useTranslations();
  const historyStore = useHistoryStore();
  const settingStore = useSettingStore();
  const promptRef = useRef<HTMLDivElement>(null);
  const optimizedPromptRef = useRef<HTMLDivElement>(null);
  const [currentId, setCurrentId] = useState<string>("");
  const [finished, setFinished] = useState<boolean>(false);
  const [presets, setPresets] = useState<Presets>({});
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [waitingCopyPrompt, setWaitingCopyPrompt] = useState<boolean>(false);
  const [waitingCopyOptimizedPrompt, setWaitingCopyOptimizedPrompt] =
    useState<boolean>(false);
  const [waitingVision, setWaitingVision] = useState<boolean>(false);
  const [canCopyPrompt, setCanCopyPrompt] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<Showcase[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const showLoadMore = useMemo(() => {
    return historyStore.history.length > currentPage * PAGE_SIZE;
  }, [historyStore.history, currentPage]);
  const historyByToday = useMemo(() => {
    return historyStore.history.filter((item) => dayjs(item.time).isToday());
  }, [historyStore.history]);

  const handleCopyPrompt = () => {
    if (promptRef.current) {
      setWaitingCopyPrompt(true);
      copy(promptRef.current?.textContent || "");
      setTimeout(() => {
        setWaitingCopyPrompt(false);
      }, 1200);
    }
  };

  const handleCopyOptimizedPrompt = () => {
    if (optimizedPromptRef.current) {
      setWaitingCopyOptimizedPrompt(true);
      copy(optimizedPromptRef.current?.textContent || "");
      setTimeout(() => {
        setWaitingCopyOptimizedPrompt(false);
      }, 1200);
    }
  };

  const handleGenerateError = (message: string | { text: string }) => {
    let description = "Unknown error";
    if (typeof message === "string") {
      description = message;
    } else {
      description = message.text;
    }
    toast.error(description);
  };

  const imagine = async () => {
    if (loading) return false;
    const text = promptRef.current?.textContent || "";
    if (!text) return;
    const { model } = useSettingStore.getState();
    // setShowChallenge(false)
    setLoading(true);
    let prompt = "";
    const ctrl = new AbortController();
    await fetchEventSource("/api/prompt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ model, presets, text }),
      openWhenHidden: true,
      signal: ctrl.signal,
      async onopen(response) {
        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429
        ) {
          ctrl.abort();
          throw new Error(t("Error.serverError"));
        }
      },
      onmessage(msg) {
        try {
          const data = JSON.parse(msg.data);
          if (msg.event === "message") {
            prompt += data.text;
            if (optimizedPromptRef.current) {
              optimizedPromptRef.current.innerText = prompt;
            }
            if (data.finish) {
              const id = uid(12);
              setCurrentId(id);
              const newRecord: Showcase = {
                id,
                text,
                uuid: "",
                prompt,
                index: 0,
                type: "image",
                time: new Date(),
              };
              historyStore.add(newRecord);
              setFinished(true);
              setLoading(false);
              ctrl.abort();
            }
          } else if (msg.event === "error") {
            handleGenerateError(data);
            setLoading(false);
          }
        } catch (err) {
          console.error(err);
          setLoading(false);
        }
      },
      onclose: () => {
        setLoading(false);
      },
      onerror: (err) => {
        console.error(err);
        ctrl.abort();
        handleGenerateError(err);
        setLoading(false);
      },
    });
  };

  const clearTextarea = () => {
    setFinished(false);
    setCanCopyPrompt(false);
    setWaitingVision(false);
    if (promptRef.current) {
      promptRef.current.innerText = "";
      promptRef.current.focus();
    }
    if (optimizedPromptRef.current) {
      optimizedPromptRef.current.innerText = "";
    }
  };

  const updateSettings = (key: keyof Presets, val: string) => {
    presets[key] = val === "Random" ? "" : val;
    setPresets(presets);
  };

  const updateOptimizedPrompt = () => {
    const optimizedPrompt = optimizedPromptRef.current?.textContent || "";
    if (optimizedPrompt) {
      historyStore.update(currentId, { prompt: optimizedPrompt });
    }
  };

  const handleImageUnderstand = (text: string) => {
    if (promptRef.current) {
      promptRef.current.innerText = text;
    }
  };

  const updateUploadStatus = (progressing: boolean) => {
    if (progressing) {
      setCanCopyPrompt(false);
      setWaitingVision(true);
    } else {
      setCanCopyPrompt(true);
      setWaitingVision(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    updateUploadStatus(true);
    await uploadMiddleware({
      file,
      onSuccess: async (newFile) => {
        const formData = new FormData();
        formData.append("file", newFile);

        const response = await fetch("/api/vision", {
          method: "POST",
          body: formData,
        });

        if (response.ok && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let text = "";

          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              updateUploadStatus(false);
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            text += chunk;
            handleImageUnderstand(text);
          }
        }
      },
      onError: (error) => {
        toast.error(error);
      },
    });
  };

  const handlePaste = async (ev: React.ClipboardEvent<HTMLDivElement>) => {
    const file = ev.clipboardData?.files[0];
    if (file) {
      ev.preventDefault();
      await handleFileUpload(file);
    }
  };

  const handleDrop = async (ev: React.DragEvent<HTMLDivElement>) => {
    ev.preventDefault();
    await handleFileUpload(ev.dataTransfer?.files[0]);
  };

  const loadMore = async () => {
    const nextPage = currentPage + 1;
    const total = nextPage * PAGE_SIZE;
    setHistoryList(historyStore.history.slice(0, total));
    setCurrentPage(nextPage);
  };

  useLayoutEffect(() => {
    setHistoryList(historyStore.history.slice(0, PAGE_SIZE));
  }, [historyStore.history]);

  return (
    <div className="w-screen">
      <div className="bg fixed -z-10 h-full w-full"></div>
      <main>
        <Header className="shadow-none bg-transparent" />
        <div className="h-full mx-auto max-w-screen-xl max-sm:px-6 max-sm:pt-8">
          <Tabs
            defaultValue="generator"
            className="w-full pt-5 text-center max-sm:pt-0"
            activationMode="automatic"
          >
            <TabsList className="rounded-full mx-auto select-none bg-slate-200/60">
              <TabsTrigger className="rounded-full" value="generator">
                <PencilRuler className="w-4 h-4" />
                {t("Prompt.tabs.generator")}
              </TabsTrigger>
              <TabsTrigger className="rounded-full" value="history">
                <History className="w-4 h-4" />
                {t("Prompt.tabs.history")}
              </TabsTrigger>
            </TabsList>
            <TabsContent className="text-left" value="generator">
              <section className="text-center pt-10 pb-10 max-sm:pt-6 max-sm:pb-6">
                <h1 className="text-2xl font-bold text-slate-800">
                  <span className="colorful">{t("Prompt.title")}</span>
                </h1>
                <p className="py-6 text-base leading-5">
                  {t("Prompt.description")}
                </p>
                <div className="flex flex-wrap justify-center gap-2 max-sm:w-64 max-sm:mx-auto">
                  <div className="inline-flex items-center px-3 py-1 text-xs rounded-full  bg-amber-400/10 text-amber-400 border border-amber-400/20">
                    <a href="https://magic666.top" target="_blank" className="hover:underline">
                      即刻AI
                    </a>
                  </div>
                  <div className="inline-flex items-center px-3 py-1 text-xs rounded-full  bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    {t("Prompt.allFree")}
                  </div>
                  <div className="inline-flex items-center px-3 py-1 text-xs rounded-full  bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    {t("Prompt.noLogin")}
                  </div>
                  <div className="inline-flex items-center px-3 py-1 text-xs rounded-full  bg-purple-500/10 text-purple-500 border border-purple-500/20">
                    {t("Prompt.unlimitedGenerations")}
                  </div>
                </div>
              </section>
              <section className="flex flex-col w-4/5 mx-auto max-sm:w-full">
                <div className="flex justify-between">
                  <h2 className="font-medium leading-8 text-gray-700">
                    {t("Prompt.generator.label")}
                  </h2>
                  <div className="flex items-center space-x-2">
                    <Select
                      value={settingStore.model}
                      onValueChange={(value) =>
                        settingStore.update("model", value)
                      }
                    >
                      <SelectTrigger className="w-auto h-8 py-0 px-0 text-black/70 shadow-none hover:text-black gap-2 select-none bg-transparent border-none focus:outline-none focus:ring-0 focus:ring-offset-0">
                        <Bot className="w-4 h-4 text-black/70" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(modelList).map(([id, name]) => {
                          return (
                            <SelectItem key={id} value={id}>
                              {name}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div
                  className="flex flex-col justify-between min-h-[144px] border pt-4 px-4 mt-2 mb-4 rounded-xl bg-white/30 overflow-hidden transition-all duration-300"
                  onPaste={handlePaste}
                  onDrop={handleDrop}
                  onDragOver={(ev) => ev.preventDefault()}
                >
                  <div
                    ref={promptRef}
                    className="min-h-[64px] overflow-y-auto outline-none"
                    contentEditable={loading ? "false" : "plaintext-only"}
                    autoFocus
                  ></div>
                  <div
                    ref={optimizedPromptRef}
                    className="text-lg border-t mt-2 pt-2 pb-2 outline-none empty:border-t-0 empty:pt-0 empty:h-0"
                    contentEditable={loading ? "false" : "plaintext-only"}
                    onBlur={() => updateOptimizedPrompt()}
                  ></div>
                  <PresetList
                    className={showSettings ? "flex" : "hidden"}
                    update={updateSettings}
                  />
                </div>
                <div className="flex justify-between">
                  <div className="flex gap-1 p-1.5 rounded-full bg-white/50 transition-opacity duration-300">
                    <Button
                      className={cn(
                        "w-6 h-6 p-1",
                        showSettings ? "text-red-400" : ""
                      )}
                      size="icon"
                      variant="ghost"
                      title={t("Prompt.generator.presetParameters")}
                      onClick={() => setShowSettings(!showSettings)}
                    >
                      <SlidersHorizontal className="h-full w-full" />
                    </Button>
                    <div className="py-1">
                      <Separator orientation="vertical" />
                    </div>
                    {canCopyPrompt ? (
                      <Button
                        className="w-6 h-6 p-1"
                        size="icon"
                        variant="ghost"
                        title={t("Prompt.generator.copyPrompt")}
                        onClick={() => handleCopyPrompt()}
                      >
                        {waitingCopyPrompt ? (
                          <Check className="h-full w-full" />
                        ) : (
                          <ClipboardCopy className="h-full w-full" />
                        )}
                      </Button>
                    ) : (
                      <Button
                        className="w-6 h-6 p-1"
                        size="icon"
                        variant="ghost"
                        title={t("Prompt.generator.imageToPrompt")}
                      >
                        <ImageUploader
                          onMessage={handleImageUnderstand}
                          onStart={() => updateUploadStatus(true)}
                          onFinish={() => updateUploadStatus(false)}
                        >
                          {waitingVision ? (
                            <LoaderCircle className="h-full w-full animate-spin" />
                          ) : (
                            <ScanEye className="h-full w-full" />
                          )}
                        </ImageUploader>
                      </Button>
                    )}
                    {finished ? (
                      <>
                        <div className="py-1">
                          <Separator orientation="vertical" />
                        </div>
                        <Button
                          className="w-6 h-6 p-1"
                          size="icon"
                          variant="ghost"
                          title={t("Prompt.generator.copyOptimizedPrompt")}
                          onClick={() => handleCopyOptimizedPrompt()}
                        >
                          {waitingCopyOptimizedPrompt ? (
                            <Check className="h-full w-full" />
                          ) : (
                            <Copy className="h-full w-full" />
                          )}
                        </Button>
                      </>
                    ) : null}
                  </div>
                  <div className="flex gap-2 select-none">
                    <Button
                      className="rounded-full bg-white/50 shadow-none"
                      size="sm"
                      variant="outline"
                      onClick={() => clearTextarea()}
                    >
                      {t("Prompt.generator.clear")}
                    </Button>
                    <Button
                      className="has-[>svg]:px-4 rounded-full bg-blue-600 text-base hover:bg-blue-700"
                      disabled={loading}
                      size="sm"
                      onClick={() => imagine()}
                    >
                      {loading ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : finished ? (
                        <RotateCcw className="mr-1 h-4 w-4" />
                      ) : (
                        <Sparkles className="mr-1 h-4 w-4" />
                      )}
                      {t("Prompt.generator.imagine")}
                    </Button>
                  </div>
                </div>
              </section>
              {historyByToday.length > 0 ? (
                <section className="w-4/5 mx-auto mt-10 text-sm max-sm:w-full">
                  <h2 className="text-base text-center my-4">
                    {t("Prompt.history.title")}
                  </h2>
                  {historyByToday.map((item, idx) => {
                    return (
                      <HistoryItem
                        key={idx}
                        item={item}
                        onDelete={(id) => historyStore.remove(id)}
                      ></HistoryItem>
                    );
                  })}
                </section>
              ) : null}
              <section className="w-4/5 mx-auto mt-10 text-sm max-sm:w-full">
                <h2 className="text-base font-semibold text-center my-4">
                  {t("Prompt.faq.title")}
                </h2>
                <Accordion type="multiple">
                  <AccordionItem value="item-1">
                    <AccordionTrigger className="text-left">
                      {t("Prompt.faq.theFirstQuestion")}
                    </AccordionTrigger>
                    <AccordionContent>
                      {t("Prompt.faq.theFirstAnswer")}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-2">
                    <AccordionTrigger className="text-left">
                      {t("Prompt.faq.theSecondQuestion")}
                    </AccordionTrigger>
                    <AccordionContent>
                      {t("Prompt.faq.theSecondAnswer")}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-3">
                    <AccordionTrigger className="text-left">
                      {t("Prompt.faq.theThirdQuestion")}
                    </AccordionTrigger>
                    <AccordionContent>
                      {t("Prompt.faq.theThirdAnswer")}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-4">
                    <AccordionTrigger>
                      {t("Prompt.faq.theFourthQuestion")}
                    </AccordionTrigger>
                    <AccordionContent className="text-left">
                      {t.rich("Prompt.faq.theFourthAnswer", {
                        strong: (chunks) => <strong>{chunks}</strong>,
                      })}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-5">
                    <AccordionTrigger className="text-left">
                      {t("Prompt.faq.theFifthQuestion")}
                    </AccordionTrigger>
                    <AccordionContent>
                      {t.rich("Prompt.faq.theFifthAnswer", {
                        link: (chunks) => (
                          <a href="https://magic666.top" target="_blank">
                            {chunks}
                          </a>
                        ),
                      })}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </section>
              <footer className="mx-auto mt-12 mb-4 text-center">
                <p className="text-sm text-gray-500">
                  {t("Prompt.disclaimer")}
                </p>
              </footer>
            </TabsContent>
            <TabsContent className="text-left pt-5" value="history">
              <section className="w-4/5 mx-auto text-sm max-sm:w-full">
                {historyList.length > 0 ? (
                  historyList.map((item) => {
                    return (
                      <HistoryItem
                        key={item.id}
                        item={item}
                        onDelete={(id) => historyStore.remove(id)}
                      ></HistoryItem>
                    );
                  })
                ) : (
                  <div className="text-gray-500 text-center">
                    {t("Prompt.noHistory")}
                  </div>
                )}
              </section>
              <div
                className={
                  showLoadMore
                    ? "text-center cursor-pointer text-sm hover:underline underline-offset-4"
                    : "hidden"
                }
                onClick={() => loadMore()}
              >
                {t("Prompt.loadMore")}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

export default memo(Prompt);
