import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function VolunteerPage() {
  return (
    <>
      <Navbar />

      <section className="bg-primary py-16 text-center">
        <h1 className="text-4xl font-bold">Become a Volunteer</h1>
      </section>

      <section className="max-w-4xl mx-auto px-4 py-16 space-y-6">
        <p>
          Volunteers are the backbone of our organization. Join us and make a
          meaningful impact in the community.
        </p>

        <button className="bg-primaryDark text-black px-6 py-3 rounded font-semibold">
          Register as Volunteer
        </button>
      </section>

      <Footer />
    </>
  );
}
