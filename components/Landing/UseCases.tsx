const UseCases = () => {
  const useCases = [
    {
      icon: "💻",
      title: "First-Time Founders",
      description:
        "Never built a startup before? Get guidance on validation, customer discovery, MVP development, and go-to-market strategy.",
    },
    {
      icon: "📚",
      title: "Side Project Builders",
      description:
        "Turning your nights and weekends into a real business. Stay focused and ship faster with strategic direction and accountability.",
    },
    {
      icon: "🚀",
      title: "Solopreneurs",
      description:
        "Building alone doesn't mean building without support. Get the strategic partner and accountability system you've been missing.",
    },
    {
      icon: "📝",
      title: "Tech Innovators",
      description:
        "Developing new products or platforms? Validate assumptions, prioritize features, and make data-driven decisions with AI guidance.",
    },
  ];

  return (
    <section className=" py-20 px-6">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-medium text-foreground">
            Built For Every Type of Builder
          </h2>
        </div>

        {/* Use Cases Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {useCases.map((useCase, index) => (
            <div
              key={index}
              className="bg-card border border-border border-solid rounded-lg p-8 space-y-4 hover:shadow-lg transition-shadow"
            >
              <h3 className="text-xl font-medium text-foreground">
                {useCase.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed font-medium text-base">
                {useCase.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UseCases;
