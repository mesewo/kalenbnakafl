import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function AboutPage() {
  return (
    <>
      <Navbar />

      <section className="bg-primary py-16 text-center">
        <h1 className="text-4xl font-bold">About Kalen Benakafil</h1>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-16 space-y-6">
        <p>
          Kalen Benakafil is a faith-based organization dedicated to spiritual
          growth, community service, and social development.
        </p>
        <p>
          Our mission is to strengthen faith, support communities, and empower
          volunteers through organized programs and events.
        </p>
      </section>

      <Footer />
    </>
  );
}
