import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils/money";

function RaceStatus({ status }) {
  const styles = {
    pending: "text-yellow-400",
    processing: "text-blue-400",
    shipped: "text-red-400",
    delivered: "text-green-400",
  };

  const normalized =
    String(status ?? "").toLowerCase() === "pending_payment"
      ? "pending"
      : String(status ?? "").toLowerCase();

  return (
    <div className="text-sm tracking-widest">
      <span className={styles[normalized] || "text-gray-400"}>
        {normalized ? normalized.toUpperCase() : "UNKNOWN"}
      </span>
    </div>
  );
}

export default async function OrdersPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const { data: orders } = await supabase
    .from("orders")
    .select("id, created_at, status, total")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      {/* HEADER */}
      <div className="mb-10 border-b border-red-600 pb-4">
        <h1 className="text-4xl font-bold tracking-widest text-red-500">
          RACE LOGS
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Performance runs & build history
        </p>
      </div>

      {!orders?.length ? (
        <div className="border border-gray-800 p-8 text-center">
          <p className="text-gray-500">No runs recorded.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <a
              key={order.id}
              href={`/order/${order.id}`}
              className="block group border border-gray-800 bg-[#0d0d0d] p-5 
                         hover:border-red-500 hover:shadow-[0_0_15px_rgba(255,0,0,0.3)] 
                         transition"
            >
              <div className="grid grid-cols-3 items-center">

                {/* RUN INFO */}
                <div>
                  <p className="text-lg tracking-wider text-red-400">
                    RUN #{order.id.slice(0, 6).toUpperCase()}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>

                {/* CENTER DATA (like telemetry) */}
                <div className="text-center">
                  <p className="text-2xl font-bold">
                    {formatMoney(order.total)}
                  </p>
                  <p className="text-xs text-gray-500">TOTAL OUTPUT</p>
                </div>

                {/* STATUS */}
                <div className="text-right">
                  <RaceStatus status={order.status} />
                </div>
              </div>

              {/* TELEMETRY BAR */}
              <div className="mt-4 h-[2px] bg-gradient-to-r 
                from-transparent via-red-500 to-transparent 
                opacity-40 group-hover:opacity-100 transition" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
