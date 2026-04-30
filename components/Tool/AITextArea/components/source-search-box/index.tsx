import { useState } from "react";
import Image from "next/image";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "../ui/command";

import { DocumentPointer } from "$/OS/AI/core/copanionkit";

export interface SourceSearchBoxProps {
  searchTerm: string;
  suggestedFiles: DocumentPointer[];
  onSelectedFile: (filePointer: DocumentPointer) => void;
}

export function SourceSearchBox(props: SourceSearchBoxProps) {
  const [selectedValue, setSelectedValue] = useState<string>("");

  return (
    <Command
      className="rounded-lg border shadow-sm"
      value={selectedValue}
      onValueChange={(value: string) => {
        setSelectedValue(value);
      }}
      filter={(value: string, search: string) => {
        // if the search term is empty, show all commands
        if (props.searchTerm === "") return 1;

        // if the search term is a prefix of the command, show it
        if (value.startsWith(props.searchTerm)) return 1;

        // otherwise, don't show it
        return 0;
      }}
    >
      <CommandInput
        value={props.searchTerm}
        className="rounded-t-lg hidden"
        placeholder="Search for a command..."
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Available resources">
          {props.suggestedFiles.map((filePointer) => {
            return (
              <CommandItem
                key={`word-${filePointer.sourceApplication}.${filePointer.name}`}
                value={filePointer.name}
                onSelect={() => {
                  props.onSelectedFile(filePointer);
                }}
              >
                <div className=" px-3  flex flex-row gap-1 items-center">
                  <Logo width="20px" height="20px">
                    <Image
                      src={filePointer.iconImageUri}
                      alt={filePointer.sourceApplication}
                      width={20}
                      height={20}
                      className="w-full h-full"
                    />
                  </Logo>
                  {filePointer.name}
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
      </CommandList>
    </Command>
  );
}

export function Logo({
  children,
  width,
  height,
}: {
  children: React.ReactNode;
  width: string;
  height: string;
}) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ width: width, height: height }}
    >
      {children}
    </div>
  );
}
