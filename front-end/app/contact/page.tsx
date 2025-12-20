import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ContactForm from "@/components/ContactForm";

export default function ContactPage() {
  return (
    <>
      <Navbar />

      <section className="bg-primary py-16 text-center">
        <h1 className="text-4xl font-bold">Contact Us</h1>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        <ContactForm />
      </section>

      <Footer />
    </>
  );
}
