import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import HyperchoForm from "@OS/Layout/Form";
import { SchemaConfig } from "@/types/form";

const LogoFormExample: React.FC = () => {
  // Example form schema configuration with logo fields
  const logoFormSchema: SchemaConfig = {
    companyName: {
      key: "companyName",
      type: "input",
      display: "Company Name",
      placeholder: "Enter your company name",
      required: true,
      requiredMessage: "Company name is required",
      description: "The official name of your company",
    },
    smallLogo: {
      key: "smallLogo",
      type: "logo",
      display: "Small Logo",
      placeholder: "Upload a small logo",
      description: "Used for avatars and small displays",
      size: "sm",
      maxSizeInMB: 2,
      convertType: "webp",
      quality: 90,
      uploadOnChange: false,
      storeLocation: "user/logos/small/",
    },
    mediumLogo: {
      key: "mediumLogo",
      type: "logo",
      display: "Medium Logo",
      placeholder: "Upload a medium logo",
      description: "Standard size for most use cases",
      size: "md",
      maxSizeInMB: 5,
      convertType: "webp",
      quality: 95,
      uploadOnChange: false,
      storeLocation: "user/logos/medium/",
    },
    largeLogo: {
      key: "largeLogo",
      type: "logo",
      display: "Large Logo",
      placeholder: "Upload a large logo",
      description: "High resolution for prominent displays",
      size: "lg",
      maxSizeInMB: 10,
      convertType: "webp",
      quality: 95,
      width: 512,
      height: 512,
      uploadOnChange: false,
      storeLocation: "user/logos/large/",
    },
    companyDescription: {
      key: "companyDescription",
      type: "textarea",
      display: "Company Description",
      placeholder: "Describe your company",
      description: "A brief description of your company",
      maxLength: 500,
      lengthHint: true,
    },
  };

  const handleSubmit = async (data: any) => {
    // Here you would typically send the data to your API
    // The logo files will be automatically uploaded to S3
  };

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Company Logo Setup</h2>
        <p className="text-muted-foreground">
          Configure your company logos with different sizes for various use
          cases.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Logo Configuration</CardTitle>
          <CardDescription>
            Upload logos in different sizes for optimal display across your
            platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HyperchoForm
            schemaConfig={logoFormSchema}
            onSubmitFunction={handleSubmit}
            formId="company-logo-setup"
            enablePersistence={true}
            title="Company Logo Setup"
            buttonText="Save Logo Configuration"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            • <strong>Small Logo (20x20):</strong> Perfect for avatars,
            favicons, and compact displays
          </p>
          <p>
            • <strong>Medium Logo (24x24):</strong> Standard size for most UI
            elements and branding
          </p>
          <p>
            • <strong>Large Logo (32x32):</strong> High resolution for prominent
            displays and print materials
          </p>
          <p>
            • All logos are automatically converted to WebP format for optimal
            compression
          </p>
          <p>
            • Form data is automatically saved and restored if you navigate away
          </p>
          <p>• Logos are uploaded to S3 when the form is submitted</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default LogoFormExample;
