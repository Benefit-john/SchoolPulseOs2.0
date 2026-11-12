import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Camera, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CameraFeed } from "@/components/camera-feed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolStore } from "@/lib/school-store";
import { requireRoles } from "@/lib/route-guards";

type CameraRow = {
  id: string;
  name: string;
  location: string;
  status: string;
  stream_url: string | null;
};
const db = () =>
  supabase as unknown as {
    from: (table: string) => ReturnType<typeof supabase.from>;
  };

export const Route = createFileRoute("/cctv")({
  ssr: false,
  beforeLoad: () => requireRoles(["admin", "security"]),
  component: CctvPage,
});

function CctvPage() {
  const { state } = useSchoolStore();
  const [cameras, setCameras] = useState<CameraRow[]>([]);
  const [viewEvents, setViewEvents] = useState<
    { id: string; camera_id: string; viewer_id: string; viewed_at: string }[]
  >([]);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [canManageCameras, setCanManageCameras] = useState(false);

  const load = useCallback(async () => {
    if (!state.school?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [cameraResult, eventsResult] = await Promise.all([
      db()
        .from("cctv_cameras")
        .select("id,name,location,status,stream_url")
        .eq("school_id", state.school.id)
        .order("name"),
      db()
        .from("camera_view_events")
        .select("id,camera_id,viewer_id,viewed_at")
        .eq("school_id", state.school.id)
        .order("viewed_at", { ascending: false })
        .limit(20),
    ]);
    if (cameraResult.error || eventsResult.error) {
      setNotice(
        cameraResult.error?.message ??
          eventsResult.error?.message ??
          "Could not load camera configuration.",
      );
      setLoading(false);
      return;
    }
    setCameras((cameraResult.data ?? []) as CameraRow[]);
    setViewEvents((eventsResult.data ?? []) as typeof viewEvents);
    setLoading(false);
  }, [state.school?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      if (active) setCanManageCameras((roles ?? []).some((row) => row.role === "admin"));
    });
    return () => {
      active = false;
    };
  }, []);

  const addCamera = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!state.school?.id || !name.trim() || !location.trim()) return;
    if (streamUrl.trim()) {
      try {
        const parsed = new URL(streamUrl.trim());
        if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error();
      } catch {
        setNotice("Use a secure HTTPS stream URL without embedded credentials.");
        return;
      }
    }
    setBusy(true);
    setNotice("");
    const { error } = await db()
      .from("cctv_cameras")
      .insert({
        school_id: state.school.id,
        name: name.trim(),
        location: location.trim(),
        stream_url: streamUrl.trim() || null,
        status: streamUrl.trim() ? "online" : "offline",
      });
    setBusy(false);
    if (error) setNotice(error.message);
    else {
      setName("");
      setLocation("");
      setStreamUrl("");
      setNotice("Camera saved.");
      await load();
    }
  };

  const logCameraView = async (cameraId: string) => {
    if (!state.school?.id) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const auditDb = supabase as unknown as {
      from: (table: "camera_view_events") => {
        insert: (row: { school_id: string; camera_id: string; viewer_id: string }) => Promise<{
          error: { message: string } | null;
        }>;
      };
    };
    const { error } = await auditDb.from("camera_view_events").insert({
      school_id: state.school.id,
      camera_id: cameraId,
      viewer_id: data.user.id,
    });
    if (!error) await load();
  };

  return (
    <AppShell title="CCTV" subtitle="Authorized monitoring for configured school cameras.">
      <div className="space-y-5">
        <div className="grid items-start gap-5 xl:grid-cols-2">
          {canManageCameras ? (
            <form
              onSubmit={(event) => void addCamera(event)}
              className="hairline-card space-y-4 p-5"
            >
              <h2 className="font-semibold">Add a camera feed</h2>
              <div className="space-y-2">
                <Label htmlFor="camera-name">Camera name</Label>
                <Input
                  id="camera-name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="camera-location">Location</Label>
                <Input
                  id="camera-location"
                  required
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="camera-stream">Browser-compatible HTTPS stream URL</Label>
                <Input
                  id="camera-stream"
                  type="url"
                  placeholder="https://camera-gateway.example/live.m3u8"
                  value={streamUrl}
                  onChange={(event) => setStreamUrl(event.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy}>
                <Plus className="size-4" />
                Save camera
              </Button>
            </form>
          ) : (
            <section className="hairline-card p-5 text-sm leading-6 text-muted-foreground">
              Camera configuration is restricted to administrators. You can view feeds and camera
              access history assigned to your school role.
            </section>
          )}
          <section className="hairline-card flex items-center p-5 text-sm leading-6 text-muted-foreground">
            Camera feeds and access history are available to administrators and authorized security
            staff. Streams that are not configured remain marked offline or unavailable.
          </section>
        </div>

        {notice ? (
          <p className="text-sm text-muted-foreground" role="status">
            {notice}
          </p>
        ) : null}
        <section className="hairline-card overflow-hidden">
          <div className="border-b border-border p-4">
            <h2 className="font-semibold">Configured cameras</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {cameras.length} feeds · video playback requires a browser-compatible gateway URL.
            </p>
          </div>
          {loading ? (
            <p className="p-5 text-sm text-muted-foreground" role="status">
              Loading configured cameras…
            </p>
          ) : cameras.length ? (
            <div className="divide-y divide-border">
              {cameras.map((camera) => (
                <article
                  key={camera.id}
                  className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(240px,.8fr)]"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Camera className="size-4 text-primary" />
                      <h3 className="font-medium">{camera.name}</h3>
                      <span className="text-xs text-muted-foreground">{camera.status}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{camera.location}</p>
                  </div>
                  <CameraFeed
                    name={camera.name}
                    location={camera.location}
                    status={camera.status}
                    streamUrl={camera.stream_url}
                    onView={() => void logCameraView(camera.id)}
                  />
                </article>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <CameraFeed
                name="Camera placeholder"
                location="Configure a camera gateway to connect"
                status="unconfigured"
                streamUrl={null}
              />
            </div>
          )}
        </section>
        <section className="hairline-card overflow-hidden">
          <div className="border-b border-border p-4">
            <h2 className="font-semibold">Recent camera views</h2>
          </div>
          <div className="divide-y divide-border">
            {viewEvents.map((event) => (
              <div key={event.id} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
                <span>
                  {cameras.find((camera) => camera.id === event.camera_id)?.name ?? "Camera"}
                </span>
                <span className="text-muted-foreground">
                  Viewer {event.viewer_id.slice(0, 8)} ·{" "}
                  {new Date(event.viewed_at).toLocaleString()}
                </span>
              </div>
            ))}
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground" role="status">
                Loading camera history…
              </p>
            ) : !viewEvents.length ? (
              <p className="p-4 text-sm text-muted-foreground">No views recorded.</p>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
