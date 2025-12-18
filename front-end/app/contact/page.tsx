import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function ContactPage() {
  return (
    <>
      <Navbar />

      <section className="bg-primary py-16 text-center">
        <h1 className="text-4xl font-bold">Contact Us</h1>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16">
        <form className="space-y-6">
          <input
            type="text"
            placeholder="Your Name"
            className="w-full border p-3 rounded"
          />
          <input
            type="email"
            placeholder="Your Email"
            className="w-full border p-3 rounded"
          />
          <textarea
            placeholder="Your Message"
            className="w-full border p-3 rounded"
            rows={5}
          />
          <button className="bg-primaryDark px-6 py-3 rounded font-semibold">
            Send Message
          </button>
        </form>
      </section>

      <Footer />
    </>
  );
}
