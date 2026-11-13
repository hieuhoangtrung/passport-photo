import {
  ActionIcon,
  Accordion,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Grid,
  Group,
  List,
  LoadingOverlay,
  SegmentedControl,
  Select,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Tooltip,
  Title,
} from '@mantine/core';
import { Dropzone, IMAGE_MIME_TYPE } from '@mantine/dropzone';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconBulb,
  IconCheck,
  IconDownload,
  IconEyeCheck,
  IconLock,
  IconPhotoUp,
  IconRefresh,
  IconSun,
  IconTrash,
  IconUser,
  IconX,
  IconZoomIn,
  IconZoomOut,
  IconBrightnessDown,
  IconBrightnessUp,
  IconArrowBackUp,
  IconArrowsHorizontal,
  IconLanguage,
  IconMapPin,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { DEFAULT_EDITS, type Check, type Edits } from './checks';
import { detect, type Detection } from './detect';
import { COUNTRIES, DEFAULT_COUNTRY, fmtRange, fmtSize, SIZES, specFor, type CountryRule, type Spec } from './formats';
import { LOCALES, localeForCountry, useI18n, type Locale } from './i18n';
import type { MessageKey } from './i18n/en';
import { browserCountry, LOCALE_KEY, parsePath, pathFor } from './route';
import { DEFAULT_PRINT, PrintSheet, type PrintSettings } from './PrintSheet';
import { DPI, downloadJpeg, render } from './render';

const IMG_KEY = 'passport-photo:image';
const SETTINGS_KEY = 'passport-photo:settings';
const MAX_SIDE = 2400; // keeps the local backup well under the ~5 MB storage limit

type Settings = { mode: 'country' | 'size'; key: string; edits: Edits; print: PrintSettings };
const DEFAULT_SETTINGS: Settings = { mode: 'country', key: DEFAULT_COUNTRY, edits: DEFAULT_EDITS, print: DEFAULT_PRINT };
const SUGGEST_KEY = 'passport-photo:suggested';

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    const out: Settings = s ? { ...DEFAULT_SETTINGS, ...s, edits: { ...DEFAULT_EDITS, ...s.edits } } : DEFAULT_SETTINGS;
    // A country in the URL wins; old saves used English names as keys.
    const fromUrl = parsePath(location.pathname).country;
    if (fromUrl) return { ...out, mode: 'country', key: fromUrl };
    if (out.mode === 'country' && !(out.key in COUNTRIES)) return { ...out, key: DEFAULT_COUNTRY };
    if (out.mode === 'size' && !(out.key in SIZES)) return { ...out, key: '35x45' };
    return out;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function toCanvas(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const SLIDERS: { key: keyof Edits; label: MessageKey; min: number; max: number; step: number; unit: string }[] = [
  { key: 'zoom', label: 'slider.zoom', min: 0.85, max: 1.15, step: 0.01, unit: '×' },
  { key: 'offsetX', label: 'slider.offsetX', min: -5, max: 5, step: 0.1, unit: ' mm' },
  { key: 'offsetY', label: 'slider.offsetY', min: -5, max: 5, step: 0.1, unit: ' mm' },
  { key: 'rotate', label: 'slider.rotate', min: -10, max: 10, step: 0.5, unit: '°' },
  { key: 'brightness', label: 'slider.brightness', min: 50, max: 150, step: 1, unit: '%' },
  { key: 'contrast', label: 'slider.contrast', min: 50, max: 150, step: 1, unit: '%' },
];

export default function App() {
  const { t, locale, setLocale, countryName } = useI18n();
  const [initial] = useState(loadSettings);
  // Read before the URL effect below rewrites the path.
  const [firstVisit] = useState(
    () => !localStorage.getItem(SETTINGS_KEY) && !localStorage.getItem(SUGGEST_KEY) && !parsePath(location.pathname).country,
  );
  const [mode, setMode] = useState(initial.mode);
  const [key, setKey] = useState(initial.key);
  const [edits, setEdits] = useState(initial.edits);
  const [print, setPrint] = useState(initial.print);
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  const [det, setDet] = useState<Detection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [suggest, setSuggest] = useState<{ cc?: string; locale?: Locale; where: string } | null>(null);
  const [backupFailed, setBackupFailed] = useState(false);

  const spec = specFor(mode, key);
  const country = mode === 'country' ? key : undefined;

  // Keep the URL, title and description in step with the language and country (shareable, crawlable).
  useEffect(() => {
    history.replaceState(null, '', pathFor(locale, country) + location.search);
    const vars = country && { country: countryName(country), size: fmtSize(spec), head: fmtRange(spec.headMin, spec.headMax) };
    const plain = (x: string) => (document.dir === 'rtl' ? x : x.replace(/[\u2066\u2069]/g, ''));
    document.title = plain(vars ? t('seo.countryTitle', vars) : t('seo.title'));
    document.querySelector('meta[name="description"]')?.setAttribute('content', plain(vars ? t('seo.countryDescription', vars) : t('seo.description')));
  }, [locale, country, spec, t, countryName]);

  // First visit: suggest rules and language for the visitor's country (host geo header, else browser region).
  useEffect(() => {
    if (!firstVisit) return;
    let live = true;
    (async () => {
      let cc: string | undefined;
      try {
        const r = await fetch('/api/geo', { signal: AbortSignal.timeout(2500) });
        if (r.ok) cc = (await r.json()).country ?? undefined;
      } catch {
        // not on Vercel, offline, or blocked: fall back to the browser language region
      }
      cc ??= browserCountry();
      if (!live || !cc) return;
      const rules = cc in COUNTRIES && cc !== key ? cc : undefined;
      const lang = localeForCountry(cc);
      const l = lang && lang !== locale ? lang : undefined;
      if (rules || l) setSuggest({ cc: rules, locale: l, where: cc });
    })();
    return () => {
      live = false;
    };
  }, []);

  function closeSuggest() {
    localStorage.setItem(SUGGEST_KEY, '1');
    setSuggest(null);
  }

  function chooseLocale(l: Locale) {
    localStorage.setItem(LOCALE_KEY, l);
    setLocale(l);
  }

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode, key, edits, print }));
  }, [mode, key, edits, print]);

  async function open(url: string, backup: boolean) {
    setBusy(true);
    setError(null);
    try {
      const c = await toCanvas(url);
      if (backup) {
        try {
          localStorage.setItem(IMG_KEY, c.toDataURL('image/jpeg', 0.92));
          setBackupFailed(false);
        } catch {
          setBackupFailed(true);
        }
      }
      setSrc(c);
      setDet(await detect(c));
    } catch (e) {
      console.error(e);
      setError('error.read');
      setSrc(null);
    } finally {
      setBusy(false);
    }
  }

  // Restore the last photo after an accidental refresh.
  useEffect(() => {
    const saved = localStorage.getItem(IMG_KEY);
    if (saved) open(saved, false);
  }, []);

  function onDrop(files: File[]) {
    const url = URL.createObjectURL(files[0]);
    setEdits(DEFAULT_EDITS);
    open(url, true).finally(() => URL.revokeObjectURL(url));
  }

  function clearAll() {
    localStorage.removeItem(IMG_KEY);
    setSrc(null);
    setDet(null);
    setEdits(DEFAULT_EDITS);
  }

  const result = useMemo(() => (src && det ? render(src, det, spec, edits) : null), [src, det, spec, edits]);

  return (
    <Box mih="100vh" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))">
      <Container size="lg" py="lg">
        <Group justify="space-between" mb="xl" wrap="wrap">
          <Group gap="sm">
            <ThemeIcon size={40} radius="md" variant="gradient" gradient={{ from: 'teal', to: 'cyan', deg: 135 }}>
              <IconUser size={24} />
            </ThemeIcon>
            <div>
              <Title order={1} size="h3">
                {country ? t('seo.countryH1', { country: countryName(country) }) : t('seo.h1')}
              </Title>
              <Text size="sm" c="dimmed">
                {t('app.title')} - {t('app.subtitle')}
              </Text>
            </div>
          </Group>
          <Group gap="sm">
            <Badge size="lg" variant="light" leftSection={<IconLock size={14} />}>
              {t('app.private')}
            </Badge>
            <Select
              aria-label={t('app.language')}
              leftSection={<IconLanguage size={16} />}
              w={170}
              allowDeselect={false}
              data={Object.entries(LOCALES).map(([value, label]) => ({ value, label }))}
              value={locale}
              onChange={(v) => v && chooseLocale(v as Locale)}
            />
          </Group>
        </Group>

        {suggest && (
          <Alert color="teal" variant="light" icon={<IconMapPin />} mb="md" withCloseButton onClose={closeSuggest}>
            <Group justify="space-between" gap="sm">
              <Text size="sm">{t('suggest.text', { country: countryName(suggest.where) })}</Text>
              <Group gap="xs">
                {suggest.cc && (
                  <Button
                    size="xs"
                    onClick={() => {
                      setMode('country');
                      setKey(suggest.cc!);
                      closeSuggest();
                    }}
                  >
                    {t('suggest.useRules', { country: countryName(suggest.cc) })}
                  </Button>
                )}
                {suggest.locale && (
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => {
                      chooseLocale(suggest.locale!);
                      closeSuggest();
                    }}
                  >
                    {t('suggest.useLang', { language: LOCALES[suggest.locale] })}
                  </Button>
                )}
                <Button size="xs" variant="subtle" color="gray" onClick={closeSuggest}>
                  {t('suggest.dismiss')}
                </Button>
              </Group>
            </Group>
          </Alert>
        )}

        {error && (
          <Alert color="red" icon={<IconX />} mb="md" withCloseButton onClose={() => setError(null)}>
            {t(error)}
          </Alert>
        )}

        {!src ? (
          <Upload onDrop={onDrop} busy={busy} />
        ) : (
          <Grid gap="lg">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="lg">
                <Card withBorder padding="lg" pos="relative">
                  <LoadingOverlay visible={busy} overlayProps={{ blur: 2 }} />
                  <Preview result={result} spec={spec} edits={edits} setEdits={setEdits} />
                  <Toolbar setEdits={setEdits} />
                  <Text size="xs" c="dimmed" ta="center" mt="xs">
                    {t('preview.hint', { size: fmtSize(spec) })}
                  </Text>
                </Card>
                <Adjust edits={edits} setEdits={setEdits} />
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="lg">
                <Card withBorder padding="lg">
                  <Title order={2} size="h5" mb="sm">
                    {t('size.title')}
                  </Title>
                  <SizePicker mode={mode} setMode={setMode} value={key} setValue={setKey} spec={spec} />
                </Card>
                <Checks checks={result?.checks ?? []} busy={busy} />
                <Download result={result} label={mode === 'size' ? key : key.toLowerCase()} onClear={clearAll} backupFailed={backupFailed} />
              </Stack>
            </Grid.Col>
            {det && result && (
              <Grid.Col span={12}>
                <PrintSheet src={src} det={det} edits={edits} spec={spec} current={result} settings={print} setSettings={setPrint} />
              </Grid.Col>
            )}
          </Grid>
        )}

        <About country={country} spec={spec} />
        <Text size="xs" c="dimmed" ta="center" mt="xl">
          {t('footer.text')} {t('footer.geo')}
        </Text>
      </Container>
    </Box>
  );
}

function Upload({ onDrop, busy }: { onDrop: (f: File[]) => void; busy: boolean }) {
  const { t } = useI18n();
  const tips = [
    { icon: IconEyeCheck, title: t('tip.straight.title'), text: t('tip.straight.text') },
    { icon: IconBulb, title: t('tip.bg.title'), text: t('tip.bg.text') },
    { icon: IconSun, title: t('tip.light.title'), text: t('tip.light.text') },
  ];
  return (
    <Stack gap="lg">
      <Dropzone onDrop={onDrop} accept={IMAGE_MIME_TYPE} multiple={false} loading={busy} radius="lg" p="xl">
        <Stack align="center" gap="xs" mih={240} justify="center" style={{ pointerEvents: 'none' }}>
          <Dropzone.Idle>
            <IconPhotoUp size={56} stroke={1.4} color="var(--mantine-color-teal-6)" />
          </Dropzone.Idle>
          <Dropzone.Accept>
            <IconCheck size={56} color="var(--mantine-color-teal-6)" />
          </Dropzone.Accept>
          <Dropzone.Reject>
            <IconX size={56} color="var(--mantine-color-red-6)" />
          </Dropzone.Reject>
          <Title order={2} size="h3" ta="center">
            {t('upload.title')}
          </Title>
          <Text c="dimmed" ta="center" maw={460}>
            {t('upload.text')}
          </Text>
        </Stack>
      </Dropzone>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {tips.map((t) => (
          <Card key={t.title} withBorder padding="md">
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon variant="light" size="lg">
                <t.icon size={20} />
              </ThemeIcon>
              <div>
                <Text fw={600} size="sm">
                  {t.title}
                </Text>
                <Text size="sm" c="dimmed">
                  {t.text}
                </Text>
              </div>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

type SetEdits = Dispatch<SetStateAction<Edits>>;

const clampEdit = (key: keyof Edits, v: number) => {
  const s = SLIDERS.find((x) => x.key === key)!;
  return Math.min(s.max, Math.max(s.min, +v.toFixed(3)));
};

// Tabler has no clear "tilt" icon (rotate arrows read as undo/redo): a tilted photo frame with a head.
const tiltIcon = (deg: number) =>
  function TiltIcon({ size = 24 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 21h18" />
        <g transform={`rotate(${deg} 12 12)`}>
          <rect x={7} y={3} width={10} height={14} rx={1.5} />
          <circle cx={12} cy={8.5} r={2} />
          <path d="M9 14.5c.8-1.4 1.8-2 3-2s2.2.6 3 2" />
        </g>
      </svg>
    );
  };

const TOOLS: { label: MessageKey; icon: React.ComponentType<{ size?: number }>; key: keyof Edits; step: number }[] = [
  { label: 'tool.zoomOut', icon: IconZoomOut, key: 'zoom', step: -0.02 },
  { label: 'tool.zoomIn', icon: IconZoomIn, key: 'zoom', step: 0.02 },
  { label: 'tool.tiltLeft', icon: tiltIcon(-15), key: 'rotate', step: -0.5 },
  { label: 'tool.tiltRight', icon: tiltIcon(15), key: 'rotate', step: 0.5 },
  { label: 'tool.darker', icon: IconBrightnessDown, key: 'brightness', step: -5 },
  { label: 'tool.brighter', icon: IconBrightnessUp, key: 'brightness', step: 5 },
];

function Toolbar({ setEdits }: { setEdits: SetEdits }) {
  const { t } = useI18n();
  return (
    <Group justify="center" gap={4} mt="md" wrap="wrap" role="toolbar" aria-label={t('tool.toolbar')}>
      {TOOLS.map((tool) => (
        <Tooltip key={tool.label} label={t(tool.label)} withArrow>
          <ActionIcon
            variant="light"
            size="lg"
            aria-label={t(tool.label)}
            onClick={() => setEdits((e) => ({ ...e, [tool.key]: clampEdit(tool.key, (e[tool.key] as number) + tool.step) }))}
          >
            <tool.icon size={20} />
          </ActionIcon>
        </Tooltip>
      ))}
      <Tooltip label={t('tool.undo')} withArrow>
        <ActionIcon variant="default" size="lg" aria-label={t('tool.undo')} onClick={() => setEdits(DEFAULT_EDITS)}>
          <IconArrowBackUp size={20} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

function Preview({ result, spec, edits, setEdits }: { result: ReturnType<typeof render> | null; spec: Spec; edits: Edits; setEdits: SetEdits }) {
  const { t } = useI18n();
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !result) return;
    c.width = result.canvas.width;
    c.height = result.canvas.height;
    c.getContext('2d')!.drawImage(result.canvas, 0, 0);
  }, [result]);

  // React wheel listeners are passive, so we need a native one to stop the page from scrolling.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setEdits((p) => ({ ...p, zoom: clampEdit('zoom', p.zoom - Math.sign(e.deltaY) * 0.01) }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setEdits]);

  // Active pointers, for pinch to zoom with two fingers.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      drag.current = null;
      pinch.current = { dist: spread(), zoom: edits.zoom };
    } else if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, ox: edits.offsetX, oy: edits.offsetY };
    }
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    drag.current = null; // lift all fingers before dragging again, so the photo does not jump
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p && pointers.current.size === 2) {
      const zoom = clampEdit('zoom', (p.zoom * spread()) / p.dist);
      setEdits((s) => ({ ...s, zoom }));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const mmPerPx = spec.w / e.currentTarget.clientWidth;
    setEdits((p) => ({
      ...p,
      offsetX: clampEdit('offsetX', d.ox + (e.clientX - d.x) * mmPerPx),
      offsetY: clampEdit('offsetY', d.oy + (e.clientY - d.y) * mmPerPx),
    }));
  };

  // Face axis through the eyes, turned by the tilt. Its top knob is a drag handle to tilt the photo.
  const pivot = result?.t?.o;
  const rad = (edits.rotate * Math.PI) / 180;
  const axis = pivot && {
    top: { x: pivot.x + Math.sin(rad) * (pivot.y - 2.5), y: 2.5 + (pivot.y - 2.5) * (1 - Math.cos(rad)) },
    bottom: { x: pivot.x - Math.sin(rad) * (spec.h - pivot.y), y: pivot.y + Math.cos(rad) * (spec.h - pivot.y) },
  };
  const tilt = useRef<{ a0: number; r0: number } | null>(null);
  const angleAt = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const px = r.left + (pivot!.x / spec.w) * r.width;
    const py = r.top + (pivot!.y / spec.h) * r.height;
    return (Math.atan2(e.clientX - px, py - e.clientY) * 180) / Math.PI;
  };
  const setTilt = (v: number) => setEdits((p) => ({ ...p, rotate: clampEdit('rotate', Math.round(v * 10) / 10) }));

  const headOk = result?.checks.find((c) => c.id === 'head')?.status === 'pass';
  const line = headOk ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-red-6)';
  return (
    <Box
      ref={box}
      pos="relative"
      mx="auto"
      maw={340}
      style={{ aspectRatio: `${spec.w} / ${spec.h}`, boxShadow: 'var(--mantine-shadow-md)', cursor: 'grab', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} aria-label={t('preview.alt')} />
      <svg viewBox={`0 0 ${spec.w} ${spec.h}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', direction: 'ltr' }} aria-hidden>
        {axis && (
          <line x1={axis.top.x} y1={axis.top.y} x2={axis.bottom.x} y2={axis.bottom.y} stroke="#fff" strokeOpacity={0.8} strokeWidth={0.2} strokeDasharray="0.8 0.8" />
        )}
        {spec.eyeMin !== undefined && spec.eyeMax !== undefined && (
          <rect x={0} width={spec.w} y={spec.h - spec.eyeMax} height={spec.eyeMax - spec.eyeMin} fill="var(--mantine-color-teal-4)" fillOpacity={0.15} />
        )}
        {result?.crown && result.chin && (
          <>
            {[result.crown.y, result.chin.y].map((y, i) => (
              <line key={i} x1={0} x2={spec.w} y1={y} y2={y} stroke={line} strokeWidth={0.25} strokeDasharray="1 0.6" />
            ))}
            <line x1={2} x2={2} y1={result.crown.y} y2={result.chin.y} stroke={line} strokeWidth={0.25} />
            <text x={2.8} y={(result.crown.y + result.chin.y) / 2} fontSize={2.2} fill={line} stroke="#fff" strokeWidth={0.4} paintOrder="stroke">
              {Math.hypot(result.chin.x - result.crown.x, result.chin.y - result.crown.y).toFixed(1)} mm
            </text>
          </>
        )}
      </svg>
      {axis && (
        <Tooltip label={t('tool.dragTilt')} withArrow position="top">
          <Box
            role="slider"
            tabIndex={0}
            aria-label={t('tool.tiltPhoto')}
            aria-valuemin={-10}
            aria-valuemax={10}
            aria-valuenow={edits.rotate}
            aria-valuetext={`${edits.rotate}°`}
            pos="absolute"
            w={26}
            h={26}
            style={{
              left: `${(axis.top.x / spec.w) * 100}%`,
              top: `${(axis.top.y / spec.h) * 100}%`,
              transform: `translate(-50%, -50%) rotate(${edits.rotate}deg)`,
              borderRadius: '50%',
              background: 'white',
              border: '2px solid var(--mantine-color-teal-6)',
              boxShadow: 'var(--mantine-shadow-sm)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--mantine-color-teal-7)',
              cursor: 'ew-resize',
              touchAction: 'none',
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // pointer already gone
              }
              tilt.current = { a0: angleAt(e), r0: edits.rotate };
            }}
            onPointerMove={(e) => {
              e.stopPropagation();
              const t = tilt.current;
              if (t) setTilt(t.r0 + angleAt(e) - t.a0);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              tilt.current = null;
            }}
            onPointerCancel={() => (tilt.current = null)}
            onKeyDown={(e) => {
              const step = { ArrowLeft: -0.5, ArrowDown: -0.5, ArrowRight: 0.5, ArrowUp: 0.5 }[e.key];
              if (step === undefined) return;
              e.preventDefault();
              setTilt(edits.rotate + step);
            }}
          >
            <IconArrowsHorizontal size={14} stroke={2.5} />
          </Box>
        </Tooltip>
      )}
    </Box>
  );
}

function SizePicker(p: {
  mode: 'country' | 'size';
  setMode: (m: 'country' | 'size') => void;
  value: string;
  setValue: (v: string) => void;
  spec: CountryRule;
}) {
  const { t, locale, countryName } = useI18n();
  const countries = useMemo(() => {
    const collator = new Intl.Collator(locale);
    return Object.keys(COUNTRIES)
      .map((value) => ({ value, label: countryName(value) }))
      .sort((a, b) => collator.compare(a.label, b.label));
  }, [locale, countryName]);
  return (
    <Stack gap="sm">
      <SegmentedControl
        fullWidth
        value={p.mode}
        onChange={(m) => {
          p.setMode(m as 'country' | 'size');
          p.setValue(m === 'country' ? DEFAULT_COUNTRY : '35x45');
        }}
        data={[
          { value: 'country', label: t('size.byCountry') },
          { value: 'size', label: t('size.bySize') },
        ]}
      />
      {p.mode === 'country' ? (
        <Select
          label={t('size.country')}
          searchable
          allowDeselect={false}
          nothingFoundMessage={t('size.notFound')}
          data={countries}
          value={p.value}
          onChange={(v) => v && p.setValue(v)}
        />
      ) : (
        <Select
          label={t('size.size')}
          allowDeselect={false}
          data={Object.entries(SIZES).map(([value, s]) => ({ value, label: value === '35x45' ? `${s.label} (${t('size.mostCountries')})` : s.label }))}
          value={p.value}
          onChange={(v) => v && p.setValue(v)}
        />
      )}
      <Text size="sm" c="dimmed">
        {t('size.summary', { size: fmtSize(p.spec), head: fmtRange(p.spec.headMin, p.spec.headMax) })}
        {p.spec.eyeMin !== undefined && p.spec.eyeMax !== undefined && t('size.eyes', { eyes: fmtRange(p.spec.eyeMin, p.spec.eyeMax) })}
        {p.mode === 'country' && p.spec.source && (
          <>
            {' · '}
            <Anchor href={p.spec.source} target="_blank" rel="noreferrer" size="sm">
              {t('size.official')}
            </Anchor>
          </>
        )}
      </Text>
      {p.mode === 'country' && p.spec.low && (
        <Alert color="yellow" variant="light" p="xs" icon={<IconAlertTriangle size={16} />}>
          <Text size="xs">{t('size.lowConfidence')}</Text>
        </Alert>
      )}
    </Stack>
  );
}

const ICON = { pass: IconCheck, warn: IconAlertTriangle, fail: IconX };
const COLOR = { pass: 'teal', warn: 'yellow', fail: 'red' };

function Checks({ checks, busy }: { checks: Check[]; busy: boolean }) {
  const { t } = useI18n();
  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h5">
          {t('checks.title')}
        </Title>
        {!busy && checks.length > 0 && (
          <Badge color={fails ? 'red' : warns ? 'yellow' : 'teal'} variant="filled">
            {fails ? t('checks.toFix', { n: fails }) : warns ? t('checks.toReview', { n: warns }) : t('checks.allPassed')}
          </Badge>
        )}
      </Group>
      <Stack gap={8} aria-live="polite">
        {busy && <Text c="dimmed">{t('checks.finding')}</Text>}
        {checks.map((c) => {
          const I = ICON[c.status];
          return (
            <Group key={c.id} gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon color={COLOR[c.status]} variant="light" size="md" radius="xl" aria-label={t(`status.${c.status}`)}>
                <I size={16} />
              </ThemeIcon>
              <div>
                <Text size="sm" fw={500}>
                  {t(`check.${c.id}` as MessageKey)}
                </Text>
                <Text size="xs" c="dimmed">
                  {t(c.msg, c.vars)}
                </Text>
              </div>
            </Group>
          );
        })}
      </Stack>
      <Text size="sm" fw={600} mt="md" mb={4}>
        {t('checks.manual')}
      </Text>
      <List size="sm" c="dimmed" spacing={2}>
        <List.Item>{t('manual.glasses')}</List.Item>
        <List.Item>{t('manual.covering')}</List.Item>
        <List.Item>{t('manual.recent')}</List.Item>
        <List.Item>{t('manual.filters')}</List.Item>
      </List>
    </Card>
  );
}

function Adjust({ edits, setEdits }: { edits: Edits; setEdits: (e: Edits) => void }) {
  const { t } = useI18n();
  // Sliders only for big screens or mouse users; phones use the photo toolbar and gestures.
  const showSliders = useMediaQuery('(min-width: 48em), (pointer: fine)', true, { getInitialValueInEffect: false });
  return (
    <Card withBorder padding="lg">
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h5">
          {t('adjust.title')}
        </Title>
        <Button size="xs" variant="subtle" leftSection={<IconRefresh size={14} />} onClick={() => setEdits(DEFAULT_EDITS)}>
          {t('adjust.reset')}
        </Button>
      </Group>
      <Text size="xs" c="dimmed" mb="md">
        {t('adjust.hint')}
        {!showSliders && ` ${t('adjust.hintTouch')}`}
      </Text>
      {showSliders && (
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="lg" verticalSpacing="md">
          {SLIDERS.map((s) => (
            <div key={s.key}>
              <Text size="sm" mb={4} id={`lbl-${s.key}`}>
                {t(s.label)}
              </Text>
              <Slider
                aria-labelledby={`lbl-${s.key}`}
                min={s.min}
                max={s.max}
                step={s.step}
                value={edits[s.key] as number}
                label={(v) => `${+v.toFixed(2)}${s.unit}`}
                onChange={(v) => setEdits({ ...edits, [s.key]: v })}
              />
            </div>
          ))}
        </SimpleGrid>
      )}
      <Switch
        mt="lg"
        checked={edits.whiteBg}
        onChange={(e) => setEdits({ ...edits, whiteBg: e.currentTarget.checked })}
        label={t('adjust.whiteBg')}
        description={t('adjust.whiteBgHint')}
      />
    </Card>
  );
}

function Download(p: { result: ReturnType<typeof render> | null; label: string; onClear: () => void; backupFailed: boolean }) {
  const { t } = useI18n();
  const fails = p.result?.checks.some((c) => c.status === 'fail');
  return (
    <Card withBorder padding="lg">
      <Title order={2} size="h5" mb="sm">
        {t('download.title')}
      </Title>
      {fails && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle />} mb="sm">
          {t('download.failed')}
        </Alert>
      )}
      <Button
        fullWidth
        leftSection={<IconDownload size={18} />}
        disabled={!p.result}
        onClick={() => p.result && downloadJpeg(p.result.canvas, DPI, `passport-photo-${p.label}.jpg`)}
      >
        {t('download.photo', { dpi: DPI })}
      </Button>
      <Text size="xs" c="dimmed" mt={6} ta="center">
        {t('download.printHint')}
      </Text>
      <Alert color="gray" variant="light" icon={<IconLock />} mt="md">
        {t('download.privacy')} {p.backupFailed ? t('download.backupFail') : t('download.backupOk')}
      </Alert>
      <Button mt="sm" fullWidth variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={p.onClear}>
        {t('download.clear')}
      </Button>
    </Card>
  );
}

/** Plain text about the tool and FAQ: visible to people and crawlers (same text as the prerendered page). */
function About({ country, spec }: { country?: string; spec: Spec }) {
  const { t, countryName } = useI18n();
  const faq = [1, 2, 3, 4, 5] as const;
  return (
    <Card withBorder padding="lg" mt="xl" component="section">
      {country && (
        <Text mb="md">
          {t('seo.countryRules', { country: countryName(country), size: fmtSize(spec), head: fmtRange(spec.headMin, spec.headMax) })}
        </Text>
      )}
      <Text mb="md">{t('seo.description')}</Text>
      <Title order={2} size="h4" mb="sm">
        {t('faq.title')}
      </Title>
      <Accordion variant="separated">
        {faq.map((n) => (
          <Accordion.Item key={n} value={String(n)}>
            <Accordion.Control>
              <Title order={3} size="h6" fw={500}>
                {t(`faq.q${n}`)}
              </Title>
            </Accordion.Control>
            <Accordion.Panel>{t(`faq.a${n}`)}</Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Card>
  );
}
