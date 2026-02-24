const Testimonials = () => {
  const testimonials = [
    {
      quote:
        "Finally validated my SaaS idea properly. Copanion asked questions I never considered. Saved me from building something nobody wanted.",
      author: "Alex Chen",
      role: "Solo SaaS Founder",
    },
    {
      quote:
        "Like having a co-founder who's always available. No equity split, no disagreements, just strategic guidance when I need it.",
      author: "Sarah Martinez",
      role: "E-commerce Entrepreneur",
    },
    {
      quote:
        "Went from idea to MVP in 8 weeks. The daily accountability kept me shipping. Best decision I made for my startup.",
      author: "Mike Thompson",
      role: "Tech Founder",
    },
  ];

  return (
    <section className="py-20 px-6">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-4xl md:text-5xl font-medium text-foreground">
            Built By Solo Founders, For Solo Founders
          </h2>
        </div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-card border border-border rounded-lg p-8 flex flex-col"
            >
              <p className="text-lg text-foreground leading-relaxed italic mb-6">
                "{testimonial.quote}"
              </p>
              <div className="pt-4 border-t border-border mt-auto">
                <p className="font-semibold text-foreground">
                  {testimonial.author}
                </p>
                <p className="text-sm text-muted-foreground">
                  {testimonial.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
