import React, { useState, useCallback, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ControllerRenderProps,
  FieldErrors,
  useForm,
  UseFormReturn,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { cn, createZobject, extractDefaultValue } from "../utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./UI/HyperchoSelect";
import { useRouter } from "next/navigation";
import {
  HyperchoInputPhone,
  HyperchoInput,
  HyperchoInputOTP,
} from "./UI/InputBox";
import { useInterim } from "../Providers/InterimProv";
import { HyperchoMutiSelect } from "./UI/Dropdown";
import Switch from "./UI/Switch";
import { FieldConfig, SchemaConfig } from "@/types/form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "$/components/UI/HyperchoAccordion";
import clsx from "clsx";
import HyperchoHint from "$/components/UI/HyperchoHint";

interface HyperchoFormProps {
  schemaConfig: SchemaConfig;
  onSubmitFunction: (data: any) => Promise<void>;
  formRef?: React.RefObject<HTMLFormElement>;
  title?: string;
  subTitle?: string;
  buttonText?: string;
  hideSubmit?: boolean;
  submitButtonRef?: React.RefObject<HTMLButtonElement>;
  formClassName?: string;
  inputStyle?: React.CSSProperties;
}

interface HyperchoFormSubmitButtonProps {
  submited: boolean;
  disabled: boolean;
}

const getAccordionKeysWithErrors = (
  errors: any,
  schemaConfig: SchemaConfig
): string[] => {
  const keysToOpen: string[] = [];

  for (const key in schemaConfig) {
    const config = schemaConfig[key];
    const error = errors[key];

    if (error) {
      if (config.collapsible) {
        keysToOpen.push(config.key);
      }

      if (config.type === "group" && config.groupFields) {
        const childKeys = getAccordionKeysWithErrors(error, config.groupFields);
        keysToOpen.push(...childKeys);
      }
    }
  }
  return keysToOpen;
};

const HyperchoFormInput = ({
  config,
  field,
  form,
  inputStyle,
}: {
  config: FieldConfig;
  field: ControllerRenderProps<
    {
      [x: string]: any;
    },
    string
  >;
  form: UseFormReturn<
    {
      [x: string]: any;
    },
    any,
    undefined
  >;
  inputStyle?: React.CSSProperties;
}) => {
  const { mobileScreen } = useInterim();
  switch (config.type) {
    case "input":
      return (
        <HyperchoInput
          placeholder={config.placeholder}
          onChange={(e) => {
            field.onChange(e.target.value);
          }}
          value={field.value || ""} // Ensure value is always a string
          className={
            "text-foreground bg-background border-2 border-solid border-input-border hover:border-input-hover"
          }
          style={inputStyle}
        />
      );
    case "password":
      return (
        <HyperchoInput
          placeholder={config.placeholder}
          onChange={(e) => {
            field.onChange(e.target.value);
          }}
          type="password"
          value={field.value || ""} // Ensure value is always a string
          className="text-foreground bg-background border-2 border-solid border-input-border hover:border-input-hover"
        />
      );
    case "textarea":
      return (
        <Textarea
          placeholder={config.placeholder}
          onChange={(e) => {
            field.onChange(e.target.value);
          }}
          value={field.value || ""} // Ensure value is always a string
          className="text-foreground bg-background border-2 border-solid border-input-border hover:border-input-hover customScrollbar"
        />
      );
    case "OTP":
      return (
        <HyperchoInputOTP
          value={field.value || ""}
          valueLength={config.valueLength || 6}
          onChange={(value) => {
            field.onChange(value);
          }}
        />
      );
    case "phone":
      return (
        <HyperchoInputPhone
          value={field.value}
          PhoneOnChange={field.onChange}
          placeholder="+1 (111) 111-1111"
          className="text-foreground bg-background border-2 border-solid border-input-border hover:border-input-hover"
        />
      );
    case "select":
      return (
        <Select onValueChange={field.onChange} value={field.value}>
          <SelectTrigger className="bg-background border-2 border-solid border-input-border hover:border-input-hover">
            <SelectValue
              placeholder={
                <span className="text-muted-foreground">
                  {config.placeholder}
                </span>
              }
            />
          </SelectTrigger>
          <SelectContent className="z-[10001]">
            <SelectGroup>
              {config.selectedValue?.map((element, index) => (
                <SelectItem
                  key={`${element.key}-${index}`}
                  value={element.value}
                >
                  <span>{element.key}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      );
    case "multiSelect":
      return (
        <HyperchoMutiSelect
          onValueChange={field.onChange}
          value={field.value}
          placeholder={config.placeholder}
          selectedValue={config.selectedValue}
          maxSelect={config.maxItems}
        />
      );
    case "checkbox":
      return (
        <Switch
          value={field.value}
          onCheckedChange={(value) => {
            field.onChange(value);
          }}
          activeText={config.activeText}
          inactiveText={config.inactiveText}
          defaultChecked={config.defaultValue}
        />
      );
    case "group":
      return (
        <div className="space-y-6 border border-solid p-10 rounded-md border-border-secondary bg-background/10 backdrop-blur-md max-sm:p-3 grid grid-cols-2 gap-4">
          {Object.entries(config.groupFields).map(
            ([key, groupConfig], index) => {
              return (
                <FormField
                  key={`${field.name}-${index}`}
                  control={form.control}
                  name={`${groupConfig.key}`}
                  render={({ field: groupField }) => {
                    if (groupConfig.collapsible) {
                      return (
                        <FormItem
                          className={
                            mobileScreen || groupConfig.layout !== "row"
                              ? "col-span-2 "
                              : "col-span-1 !mt-0"
                          }
                        >
                          <AccordionItem value={groupConfig.key}>
                            <AccordionTrigger>
                              {groupConfig.display}
                            </AccordionTrigger>
                            <AccordionContent>
                              <FormControl>
                                <>
                                  <HyperchoFormInput
                                    config={groupConfig}
                                    field={groupField}
                                    form={form} // Pass form to nested HyperchoFormInput
                                  />
                                  {groupConfig.description && (
                                    <FormDescription>
                                      {groupConfig.description}
                                    </FormDescription>
                                  )}
                                </>
                              </FormControl>
                              {groupConfig.type !== "group" && (
                                <div className="flex flex-row justify-between">
                                  {form.formState.errors[key] ? (
                                    <FormMessage />
                                  ) : (
                                    <div></div>
                                  )}
                                  {groupConfig.lengthHint && (
                                    <FormDescription
                                      className={clsx(
                                        `whitespace-nowrap ml-2 text-sm`,
                                        {
                                          "!text-destructive":
                                            field.value.length >
                                            (groupConfig.maxLength
                                              ? groupConfig.maxLength
                                              : 50),
                                          "!text-primary-foreground":
                                            field.value.length <=
                                            (groupConfig.maxLength
                                              ? groupConfig.maxLength
                                              : 50),
                                        }
                                      )}
                                    >
                                      {`${field.value.length} / ${groupConfig.maxLength}`}
                                    </FormDescription>
                                  )}
                                </div>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        </FormItem>
                      );
                    }
                    return (
                      <FormItem
                        className={
                          mobileScreen || groupConfig.layout !== "row"
                            ? "col-span-2 "
                            : "col-span-1 !mt-0"
                        }
                      >
                        <FormLabel className="text-sm font-medium text-white mb-1">
                          <div className="flex flex-row items-center gap-3">
                            {groupConfig.display}
                            {config.hintMessage && (
                              <HyperchoHint value={config.hintMessage} />
                            )}
                          </div>
                        </FormLabel>
                        <FormControl>
                          <>
                            <HyperchoFormInput
                              config={groupConfig}
                              field={groupField}
                              form={form} // Pass form to nested HyperchoFormInput
                            />
                            {groupConfig.description && (
                              <FormDescription>
                                {groupConfig.description}
                              </FormDescription>
                            )}
                          </>
                        </FormControl>
                        {groupConfig.type !== "group" && (
                          <div className="flex flex-row justify-between">
                            {form.formState.errors[key] ? (
                              <FormMessage />
                            ) : (
                              <div></div>
                            )}
                            {groupConfig.lengthHint && (
                              <FormDescription
                                className={clsx(
                                  `whitespace-nowrap ml-2 text-xs`,
                                  {
                                    "!text-destructive":
                                      field.value.length >
                                      (groupConfig.maxLength
                                        ? groupConfig.maxLength
                                        : 50),
                                    "!text-muted-foreground":
                                      field.value.length <=
                                      (groupConfig.maxLength
                                        ? groupConfig.maxLength
                                        : 50),
                                  }
                                )}
                              >
                                {`${field.value.length} / ${groupConfig.maxLength}`}
                              </FormDescription>
                            )}
                          </div>
                        )}
                      </FormItem>
                    );
                  }}
                />
              );
            }
          )}
        </div>
      );
    default:
      return <></>;
  }
};

const HyperchoFormSubmitButton = (props: HyperchoFormSubmitButtonProps) => {
  const { submited, disabled } = props;
  const { push } = useRouter();
  if (submited) {
    return (
      <Button
        type="button"
        className="col-span-2 text-button-font bg-input-button-background hover:bg-secondary-hover active:bg-secondary-active"
        onClick={() => {
          push("/dashboard");
        }}
      >
        Back To Home
      </Button>
    );
  }
  return (
    <Button
      type="submit"
      className="col-span-2 text-button-font bg-input-button-background hover:bg-secondary-hover active:bg-secondary-active"
      disabled={disabled}
    >
      Submit
    </Button>
  );
};

const HyperchoForm = (props: HyperchoFormProps) => {
  const {
    schemaConfig,
    onSubmitFunction,
    formRef,
    hideSubmit,
    submitButtonRef,
    formClassName,
    inputStyle,
  } = props;
  const FormSchema = createZobject(schemaConfig);
  const defaultValues = extractDefaultValue(schemaConfig);
  const [submited, setSubmited] = useState(false);
  const { mobileScreen } = useInterim();
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues,
  });
  const [hasChanges, setHasChanges] = useState(false);

  // Reset form when schemaConfig changes (i.e., after submission)
  useEffect(() => {
    const newDefaultValues = extractDefaultValue(schemaConfig);
    form.reset(newDefaultValues);
  }, [schemaConfig, form]);

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    await onSubmitFunction(data);
    setSubmited(true);
  }

  useEffect(() => {
    const keysWithErrors = getAccordionKeysWithErrors(
      form.formState.errors,
      schemaConfig
    );
    setOpenAccordions(keysWithErrors);
  }, [form.formState.errors, schemaConfig]);

  useEffect(() => {
    if (form.formState.isDirty) {
      setHasChanges(true);
      if (submitButtonRef && submitButtonRef.current) {
        submitButtonRef.current!.disabled = false;
      }
    } else {
      setHasChanges(false);
      if (submitButtonRef && submitButtonRef.current) {
        submitButtonRef.current!.disabled = true;
      }
    }
  }, [form.formState.isDirty]);

  return (
    <Accordion
      type="multiple"
      className="w-full"
      value={openAccordions}
      onValueChange={setOpenAccordions}
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className={cn(
            `w-full space-y-6 border border-solid p-10 rounded-md border-border-secondary bg-background/10 backdrop-blur-md max-sm:p-3 grid grid-cols-2 gap-4`,
            formClassName
          )}
          ref={formRef}
        >
          {Object.entries(schemaConfig).map(([key, config], index) => {
            return (
              <FormField
                control={form.control}
                name={key}
                key={index + key}
                render={({ field }) => {
                  if (config.collapsible) {
                    return (
                      <FormItem
                        className={
                          mobileScreen || config.layout !== "row"
                            ? "col-span-2 !mt-0"
                            : "col-span-1 !mt-0"
                        }
                      >
                        <AccordionItem value={config.key}>
                          <AccordionTrigger>{config.display}</AccordionTrigger>
                          <AccordionContent>
                            <FormControl>
                              <>
                                <HyperchoFormInput
                                  form={form}
                                  config={config}
                                  field={field}
                                  inputStyle={inputStyle}
                                />
                                {config.description && (
                                  <FormDescription>
                                    {config.description}
                                  </FormDescription>
                                )}
                              </>
                            </FormControl>
                            {config.type !== "group" && (
                              <div className="flex flex-row justify-between">
                                {form.formState.errors[key] ? (
                                  <FormMessage />
                                ) : (
                                  <div></div>
                                )}
                                {config.lengthHint && (
                                  <FormDescription
                                    className={clsx(
                                      `whitespace-nowrap ml-2 text-sm`,
                                      {
                                        "!text-destructive":
                                          field.value.length >
                                          (config.maxLength
                                            ? config.maxLength
                                            : 50),
                                        "!text-foreground":
                                          field.value.length <=
                                          (config.maxLength
                                            ? config.maxLength
                                            : 50),
                                      }
                                    )}
                                  >
                                    {`${field.value.length} / ${config.maxLength}`}
                                  </FormDescription>
                                )}
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      </FormItem>
                    );
                  }
                  return (
                    <FormItem
                      className={
                        mobileScreen || config.layout !== "row"
                          ? "col-span-2 !mt-0"
                          : "col-span-1 !mt-0"
                      }
                    >
                      <FormLabel className="text-white">
                        <div className="flex flex-row items-center gap-3">
                          {config.display}
                          {config.hintMessage && (
                            <HyperchoHint value={config.hintMessage} />
                          )}
                        </div>
                      </FormLabel>
                      <FormControl>
                        <>
                          <HyperchoFormInput
                            form={form}
                            config={config}
                            field={field}
                            inputStyle={inputStyle}
                          />
                          {config.description && (
                            <FormDescription>
                              {config.description}
                            </FormDescription>
                          )}
                        </>
                      </FormControl>
                      {config.type !== "group" && (
                        <div className="flex flex-row justify-between">
                          {form.formState.errors[key] ? (
                            <FormMessage />
                          ) : (
                            <div></div>
                          )}
                          {config.lengthHint && (
                            <FormDescription
                              className={clsx(
                                `whitespace-nowrap ml-2 text-xs`,
                                {
                                  "!text-destructive":
                                    field.value.length >
                                    (config.maxLength ? config.maxLength : 50),
                                  "!text-muted-foreground":
                                    field.value.length <=
                                    (config.maxLength ? config.maxLength : 50),
                                }
                              )}
                            >
                              {`${field.value.length} / ${config.maxLength}`}
                            </FormDescription>
                          )}
                        </div>
                      )}
                    </FormItem>
                  );
                }}
              />
            );
          })}
          {!hideSubmit && (
            <HyperchoFormSubmitButton
              submited={submited}
              disabled={form.formState.isSubmitting || !hasChanges}
            />
          )}
        </form>
      </Form>
    </Accordion>
  );
};

export default HyperchoForm;
