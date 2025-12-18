import Link from "next/link";

export default function DashboardSidebar() {
  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen">
      <div className="p-6 text-xl font-bold text-primary">
        Admin Panel
      </div>

      <nav className="flex flex-col space-y-2 px-4">
        <Link href="/dashboard" className="hover:bg-gray-800 p-2 rounded">
          Dashboard
        </Link>
        <Link href="/dashboard/users" className="hover:bg-gray-800 p-2 rounded">
          Users
        </Link>
        <Link href="/dashboard/posts" className="hover:bg-gray-800 p-2 rounded">
          Blog / News
        </Link>
        <Link href="/dashboard/events" className="hover:bg-gray-800 p-2 rounded">
          Events
        </Link>
        <Link href="/dashboard/media" className="hover:bg-gray-800 p-2 rounded">
          Media Library
        </Link>
        <Link
          href="/dashboard/volunteers"
          className="hover:bg-gray-800 p-2 rounded"
        >
          Volunteers
        </Link>
      </nav>
    </aside>
  );
}
