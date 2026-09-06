export default function ListingsLoading() {
  return (
    <main className="min-h-screen animate-pulse bg-stone-50">
      <div className="h-64 bg-slate-900" />
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-10 md:grid-cols-3 lg:px-10">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-96 rounded-3xl border border-stone-200 bg-white"
          />
        ))}
      </div>
    </main>
  );
}
