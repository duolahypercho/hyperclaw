import React, { useState, useCallback, useEffect, useRef } from "react";
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
import { cn, createZobject, extractDefaultValue } from "$/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "$/components/UI/HyperchoSelect";
import { useRouter } from "next/navigation";
import {
  HyperchoInputPhone,
  HyperchoInput,
  HyperchoInputOTP,
} from "$/components/UI/InputBox";
import { useInterim } from "$/Providers/InterimProv";
import Switch from "$/components/UI/Switch";
import { FieldConfig, SchemaConfig } from "@/types/form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "$/components/UI/HyperchoAccordion";
import HyperchoHint from "$/components/UI/HyperchoHint";
import HyperchoImageInput from "$/components/UI/HyperchoImageInput";
import HyperchoLogoInput from "$/components/UI/HyperchoLogoInput";

export interface HyperchoFormProps {
  schemaConfig: SchemaConfig;
  onSubmitFunction?: (data: any) => Promise<void>;
  formRef?: React.RefObject<HTMLFormElement>;
  title?: string;
  subTitle?: string;
  buttonText?: string;
  hideSubmit?: boolean;
  submitButtonRef?: React.RefObject<HTMLButtonElement>;
  formClassName?: string;
  inputStyle?: React.CSSProperties;
  formId?: string;
  enablePersistence?: boolean;
  onFormClose?: (data: any, hasChanges: boolean) => void;
  showUnsavedChangesWarning?: boolean;
}

interface HyperchoFormSubmitButtonProps {
  submited: boolean;
  disabled: boolean;
}

// Simple localStorage utility for form persistence
const FORM_STORAGE_KEY = "hypercho-form-persistence";

const saveFormData = (formId: string, data: any): void => {
  if (typeof window === "undefined") return;

  try {
    const storage = JSON.parse(localStorage.getItem(FORM_STORAGE_KEY) || "{}");
    storage[formId] = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(storage));
  } catch (error) {
    console.error("Failed to save form data:", error);
  }
};

const getFormData = (formId: string): any => {
  if (typeof window === "undefined") return null;

  try {
    const storage = JSON.parse(localStorage.getItem(FORM_STORAGE_KEY) || "{}");
    return storage[formId]?.data || null;
  } catch (error) {
    console.error("Failed to get form data:", error);
    return null;
  }
};

const clearFormData = (formId: string): void => {
  if (typeof window === "undefined") return;

  try {
    const storage = JSON.parse(localStorage.getItem(FORM_STORAGE_KEY) || "{}");
    delete storage[formId];
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(storage));
  } catch (error) {
    console.error("Failed to clear form data:", error);
  }
};

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
  // Check if we're inside a dialog context
  const isInDialog =
    typeof window !== "undefined" &&
    document.querySelector('[role="dialog"]') !== null;

  switch (config.type) {
    case "input":
      return (
        <HyperchoInput
          placeholder={config.placeholder}
          onChange={(e) => {
            field.onChange(e.target.value);
          }}
          value={field.value || ""} // Ensure value is always a string
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
          className="text-white bg-input-background border-2 border-solid border-input-border hover:border-input-hover"
        />
      );
    case "select":
      return (
        <Select onValueChange={field.onChange} value={field.value}>
          <SelectTrigger>
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
                <SelectItem key={`${element.key}-${index}`} value={element.key}>
                  <span>{element.value}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
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
    case "image":
      return (
        <HyperchoImageInput
          value={field.value || ""}
          onChange={(value) => {
            field.onChange(value);
          }}
          placeholder={config.placeholder || "Upload an image"}
          convertType={config.convertType}
          quality={config.quality}
          width={config.width}
          height={config.height}
          uploadOnChange={config.uploadOnChange}
          storeLocation={config.storeLocation}
          className={config.className}
        />
      );
    case "logo":
      return (
        <HyperchoLogoInput
          value={field.value || ""}
          onChange={(value) => {
            field.onChange(value);
          }}
          placeholder={config.placeholder || "Upload a logo"}
          convertType={config.convertType}
          quality={config.quality}
          width={config.width}
          height={config.height}
          uploadOnChange={config.uploadOnChange}
          variant={config.variant}
          storeLocation={config.storeLocation}
          className={config.className}
          size={config.size || "md"}
          maxSizeInMB={config.maxSizeInMB}
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
                                <HyperchoFormInput
                                  config={groupConfig}
                                  field={groupField}
                                  form={form} // Pass form to nested HyperchoFormInput
                                />
                              </FormControl>
                              {groupConfig.type !== "group" && (
                                <div
                                  className={cn(
                                    "flex flex-row justify-between items-center gap-2"
                                  )}
                                >
                                  {form.formState.errors[key] ? (
                                    <FormMessage />
                                  ) : (
                                    <div className="flex-1">
                                      {groupConfig.description && (
                                        <FormDescription className="truncate">
                                          {groupConfig.description}
                                        </FormDescription>
                                      )}
                                    </div>
                                  )}
                                  {groupConfig.lengthHint && (
                                    <FormDescription
                                      className={cn(
                                        `whitespace-nowrap text-xs shrink-0`,
                                        {
                                          "!text-destructive":
                                            groupField.value.length >
                                            (groupConfig.maxLength
                                              ? groupConfig.maxLength
                                              : 50),
                                          "!text-muted-foreground":
                                            groupField.value.length <=
                                            (groupConfig.maxLength
                                              ? groupConfig.maxLength
                                              : 50),
                                        }
                                      )}
                                    >
                                      {`${groupField.value.length} / ${groupConfig.maxLength}`}
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
                        <FormLabel className="text-sm font-medium text-foreground mb-1">
                          <div className="flex flex-row items-center gap-3">
                            {groupConfig.display}
                            {groupConfig.hintMessage && (
                              <HyperchoHint value={groupConfig.hintMessage} />
                            )}
                          </div>
                        </FormLabel>
                        <FormControl>
                          <HyperchoFormInput
                            config={groupConfig}
                            field={groupField}
                            form={form} // Pass form to nested HyperchoFormInput
                          />
                        </FormControl>
                        {groupConfig.type !== "group" && (
                          <div
                            className={cn(
                              "flex flex-row justify-between items-center gap-2"
                            )}
                          >
                            {form.formState.errors[key] ? (
                              <FormMessage />
                            ) : (
                              <div className="flex-1">
                                {groupConfig.description && (
                                  <FormDescription className="truncate">
                                    {groupConfig.description}
                                  </FormDescription>
                                )}
                              </div>
                            )}
                            {groupConfig.lengthHint && (
                              <FormDescription
                                className={cn(
                                  `whitespace-nowrap text-xs shrink-0`,
                                  {
                                    "!text-destructive":
                                      groupField.value.length >
                                      (groupConfig.maxLength
                                        ? groupConfig.maxLength
                                        : 50),
                                    "!text-muted-foreground":
                                      groupField.value.length <=
                                      (groupConfig.maxLength
                                        ? groupConfig.maxLength
                                        : 50),
                                  }
                                )}
                              >
                                {`${groupField.value.length} / ${groupConfig.maxLength}`}
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
    formId = "default-form",
    enablePersistence = true,
    onFormClose,
    showUnsavedChangesWarning = true,
  } = props;

  const FormSchema = createZobject(schemaConfig);
  const defaultValues = extractDefaultValue(schemaConfig);
  const [submited, setSubmited] = useState(false);
  const { mobileScreen } = useInterim();
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);
  const { toast } = useToast();

  // Get saved data for this form
  const savedData = getFormData(formId);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: savedData || defaultValues,
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasRestoredData, setHasRestoredData] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const previousSchemaRef = useRef<SchemaConfig | null>(null);

  // Initialize form with saved data only once
  useEffect(() => {
    if (!isInitialized && savedData) {
      form.reset(savedData);
      setIsInitialized(true);
      setHasRestoredData(true);
      // If we have restored data, allow submission even if no changes made
      setHasChanges(true);
    } else if (!isInitialized) {
      setIsInitialized(true);
    }

    // Reset submission state when form is re-initialized
    setHasSubmitted(false);
  }, [form, savedData, isInitialized, formId]);

  // Reset form when schemaConfig changes (but not after submission)
  useEffect(() => {
    if (!isInitialized) return;

    const newDefaultValues = extractDefaultValue(schemaConfig);
    const hasSchemaChanged =
      previousSchemaRef.current !== null &&
      JSON.stringify(previousSchemaRef.current) !==
        JSON.stringify(schemaConfig);

    // Only reset if:
    // 1. Schema has actually changed (not just first load)
    // 2. There's no saved data
    // 3. We haven't just submitted the form
    if (hasSchemaChanged && !savedData && !hasSubmitted) {
      form.reset(newDefaultValues);
      setHasRestoredData(false);
    }

    // Update the previous schema reference
    previousSchemaRef.current = schemaConfig;
  }, [schemaConfig, form, savedData, isInitialized, hasSubmitted]);

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setHasSubmitted(true); // Mark that we've submitted
    await onSubmitFunction?.(data);
    setSubmited(true);
    clearFormData(formId); // Clear saved data after successful submission
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
      // If we have restored data, still allow submission
      const shouldAllowSubmission = hasRestoredData;
      setHasChanges(shouldAllowSubmission);
      if (submitButtonRef && submitButtonRef.current) {
        submitButtonRef.current!.disabled = !shouldAllowSubmission;
      }
    }
  }, [form.formState.isDirty, hasRestoredData, submitButtonRef]);

  // Handle form closure - save data if there are changes
  const handleFormClose = useCallback(() => {
    if (hasChanges && enablePersistence) {
      const currentData = form.getValues();
      saveFormData(formId, currentData);
    }
    onFormClose?.(form.getValues(), hasChanges);
  }, [hasChanges, enablePersistence, form, formId, onFormClose]);

  // Expose handleFormClose to parent component
  useEffect(() => {
    if (formRef?.current) {
      (formRef.current as any).handleFormClose = handleFormClose;
    }
  }, [handleFormClose, formRef]);

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
          className={cn("flex flex-col gap-3", formClassName)}
          ref={formRef}
        >
          {/* Form fields */}
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
                              <HyperchoFormInput
                                form={form}
                                config={config}
                                field={field}
                                inputStyle={inputStyle}
                              />
                            </FormControl>
                            {config.type !== "group" && (
                              <div
                                className={cn(
                                  "flex flex-row justify-between items-center gap-2"
                                )}
                              >
                                {form.formState.errors[key] ? (
                                  <FormMessage />
                                ) : (
                                  <div className="flex-1">
                                    {config.description && (
                                      <FormDescription className="truncate text-xs">
                                        {config.description}
                                      </FormDescription>
                                    )}
                                  </div>
                                )}
                                {config.lengthHint && (
                                  <FormDescription
                                    className={cn(
                                      `whitespace-nowrap text-xs shrink-0 text-muted-foreground`,
                                      {
                                        "!text-destructive":
                                          field.value.length >
                                          (config.maxLength
                                            ? config.maxLength
                                            : 50),
                                        "!text-muted-foreground":
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
                      <FormLabel className="text-sm font-medium text-foreground mb-1">
                        <div className="flex flex-row items-center gap-3">
                          {config.display}
                          {config.hintMessage && (
                            <HyperchoHint value={config.hintMessage} />
                          )}
                        </div>
                      </FormLabel>
                      <FormControl>
                        <HyperchoFormInput
                          form={form}
                          config={config}
                          field={field}
                          inputStyle={inputStyle}
                        />
                      </FormControl>
                      {config.type !== "group" && (
                        <div
                          className={cn(
                            "flex flex-row justify-between items-center gap-2"
                          )}
                        >
                          {form.formState.errors[key] ? (
                            <FormMessage />
                          ) : (
                            <div className="flex-1">
                              {config.description && (
                                <FormDescription className="truncate text-xs">
                                  {config.description}
                                </FormDescription>
                              )}
                            </div>
                          )}
                          {config.lengthHint && (
                            <FormDescription
                              className={cn(
                                `whitespace-nowrap text-xs shrink-0 text-muted-foreground`,
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
              disabled={
                form.formState.isSubmitting || (!hasChanges && !hasRestoredData)
              }
            />
          )}
        </form>
      </Form>
    </Accordion>
  );
};

export default HyperchoForm;
