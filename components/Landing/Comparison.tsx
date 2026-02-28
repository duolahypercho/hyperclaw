import { Check, X } from "lucide-react";

const Comparison = () => {
  const features = [
    {
      name: "Active Checking",
      todoApps: false,
      focusmate: true,
      copanion: true,
    },
    {
      name: "Always Available",
      todoApps: true,
      focusmate: false,
      focusmateNote: "(schedule)",
      copanion: true,
    },
    {
      name: "Visual Presence",
      todoApps: false,
      focusmate: true,
      focusmateNote: "(human)",
      copanion: true,
      copanionNote: "(AI)",
    },
    {
      name: "No Social Anxiety",
      todoApps: true,
      focusmate: false,
      focusmateNote: "(video)",
      copanion: true,
    },
    {
      name: "Tracks Progress",
      todoApps: true,
      focusmate: false,
      copanion: true,
    },
  ];

  return (
    <section className="py-20 px-6">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-medium text-foreground">
            How Hyperclaw is Different
          </h2>
        </div>

        {/* Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-card rounded-lg overflow-hidden shadow-lg">
            <thead>
              <tr className="bg-muted">
                <th className="p-4 text-left font-semibold text-foreground border-b border-border">
                  Feature
                </th>
                <th className="p-4 text-center font-semibold text-foreground border-b border-l border-border">
                  Todo Apps
                </th>
                <th className="p-4 text-center font-semibold text-foreground border-b border-l border-border">
                  Focusmate
                </th>
                <th className="p-4 text-center font-semibold text-primary border-b border-l border-border bg-primary/5">
                  Hyperclaw
                </th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature, index) => (
                <tr key={index} className="border-b border-border last:border-0">
                  <td className="p-4 font-medium text-foreground">
                    {feature.name}
                  </td>
                  <td className="p-4 text-center border-l border-border">
                    {feature.todoApps ? (
                      <Check className="w-6 h-6 text-green-600 mx-auto" />
                    ) : (
                      <X className="w-6 h-6 text-red-500 mx-auto" />
                    )}
                  </td>
                  <td className="p-4 text-center border-l border-border">
                    <div className="flex flex-col items-center gap-1">
                      {feature.focusmate ? (
                        <Check className="w-6 h-6 text-green-600" />
                      ) : (
                        <X className="w-6 h-6 text-red-500" />
                      )}
                      {feature.focusmateNote && (
                        <span className="text-xs text-muted-foreground">
                          {feature.focusmateNote}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-center border-l border-border bg-primary/5">
                    <div className="flex flex-col items-center gap-1">
                      {feature.copanion ? (
                        <Check className="w-6 h-6 text-green-600" />
                      ) : (
                        <X className="w-6 h-6 text-red-500" />
                      )}
                      {feature.copanionNote && (
                        <span className="text-xs text-muted-foreground">
                          {feature.copanionNote}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="text-center mt-12">
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Best of both worlds: Active accountability without the scheduling
            hassle or social pressure.
          </p>
        </div>
      </div>
    </section>
  );
};

export default Comparison;
