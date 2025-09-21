import { memo } from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import LocaleSwitcher from "@/components/locale-switcher";
import { cn } from "@/utils/style";

type Props = {
  className?: string;
  showBg?: boolean;
};

function Header({ className, showBg }: Props) {
  const t = useTranslations();

  return (
    <div
      className={cn(
        "w-screen py-2 bg-white shadow-sm select-none max-xl:px-1",
        className
      )}
    >
      {showBg ? (
        <div className="bg absolute -z-10 top-0 left-0 h-14 w-full"></div>
      ) : null}
      <div className="max-w-screen-xl flex justify-between mx-auto">
        <div></div>
        <div className="flex items-center">
          <Button
            className="h-8 w-8"
            title="magic666 即刻AI"
            variant="ghost"
            size="icon"
          >
            <a
              href="https://magic666.top"
              target="_blank"
            >
              <Sparkles className="h-5 w-5" />
            </a>
          </Button>
          <LocaleSwitcher />
        </div>
      </div>
    </div>
  );
}

export default memo(Header);
