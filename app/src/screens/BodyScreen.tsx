import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { useTheme } from '../theme/ThemeContext';
import { font, radius, space, tnum } from '../theme/tokens';
import { useStore } from '../data/store';
import { useUnits } from '../data/derived';
import { Card, Grid } from '../components/Card';
import { EmptyState, GhostButton, NumberField, PrimaryButton } from '../components/Controls';
import { Icon } from '../components/Icon';
import { ConfirmDialog, Sheet } from '../components/Overlays';
import { Screen } from '../components/Screen';
import { Body, Caption, Stat, Title } from '../components/Type';
import { MEASUREMENT_FIELDS, measurementDeltas, photoComparison } from '../lib/calc';
import { formatShort, todayKey } from '../lib/date';
import { deletePhoto, pickFromLibrary, takePhoto } from '../lib/photos';
import { Measurement } from '../data/types';

type Draft = Record<string, string>;

export function BodyScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  const { data, addMeasurement, updateMeasurement, removeMeasurement, showToast } = useStore();
  const u = useUnits();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [photoFor, setPhotoFor] = useState<Measurement | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Measurement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Measurement | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const comparison = photoComparison(data.measurements, data.entries);

  /**
   * Attaching replaces whatever was there. The old file is deleted only once
   * the new URI is in the store, so a failed pick never loses the old photo.
   */
  const attach = async (target: Measurement, source: 'camera' | 'library') => {
    if (busy) return;
    setBusy(true);
    try {
      const result =
        source === 'camera' ? await takePhoto(target.logDate) : await pickFromLibrary(target.logDate);
      if (result.canceled) return;

      const previous = target.photo;
      updateMeasurement(target.id, { photo: result.uri });
      if (previous && previous !== result.uri) deletePhoto(previous);
      setPhotoFor(null);
      showToast('Photo attached');
    } catch {
      showToast('Could not attach that photo');
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = (target: Measurement) => {
    updateMeasurement(target.id, { photo: null });
    deletePhoto(target.photo);
    setConfirmRemove(null);
    setPhotoFor(null);
    showToast('Photo removed');
  };

  const deleteMeasurement = (target: Measurement) => {
    setConfirmDelete(null);
    setPhotoFor(null);
    // The store keeps the photo file until the undo window closes.
    removeMeasurement(target.id);
  };

  const rows = measurementDeltas(data.measurements);
  const sorted = data.measurements.slice().sort((a, b) => (a.logDate < b.logDate ? -1 : 1));
  const hasBaseline = rows.length > 0;

  const submit = () => {
    const values = MEASUREMENT_FIELDS.map(({ key }) => Number.parseFloat(draft[key] ?? ''));
    if (values.some((v) => !Number.isFinite(v) || v <= 0)) {
      showToast('Fill in all five measurements');
      return;
    }
    addMeasurement({
      logDate: todayKey(),
      waistCm: values[0],
      chestCm: values[1],
      armsCm: values[2],
      thighsCm: values[3],
      neckCm: values[4],
      photo: null,
    });
    // The store raises the toast — it is the one that knows whether this
    // replaced an existing set, and therefore whether to offer an undo.
    setDraft({});
    setSheetOpen(false);
  };

  return (
    <Screen title="Body" meta="Measurements" onBack={onBack}>
      {hasBaseline ? (
        <>
          <View style={{ gap: space.sm }}>
            {rows.map((row) => {
              const shrunk = row.deltaCm <= 0;
              return (
                <Card
                  key={row.key}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 17, paddingVertical: 15 }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Body style={{ fontFamily: font.semibold, fontSize: 14.5 }}>{row.label}</Body>
                    <Caption style={{ fontSize: 11.5 }}>
                      Since first measurement · {u.length(row.firstCm)}
                    </Caption>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 1 }}>
                    <Stat>{u.lengthValue(row.latestCm)}</Stat>
                    <Caption
                      style={[{ fontSize: 12, fontFamily: font.semibold }, tnum]}
                      color={shrunk ? colors.greenText : colors.text}
                    >
                      {Math.abs(row.deltaCm) < 0.05
                        ? 'No change'
                        : `${shrunk ? '↓' : '↑'} ${u.length(Math.abs(row.deltaCm))}`}
                    </Caption>
                  </View>
                </Card>
              );
            })}
          </View>

          <Card hero style={{ padding: 18, marginTop: space.sm }}>
            <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>Progress photos</Body>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
              {sorted.slice(-4).map((m) => (
                <PhotoTile key={m.id} measurement={m} onPress={() => setPhotoFor(m)} />
              ))}
            </View>
            <Caption style={{ fontSize: 11.5, lineHeight: 17, marginTop: space.md }}>
              Tap a day to attach a photo. Photos stay on this device — nothing is uploaded, and
              they only leave if you include them in a backup.
            </Caption>
            {comparison && (
              <GhostButton
                label="Compare first and latest"
                onPress={() => setCompareOpen(true)}
                style={{ marginTop: space.md }}
              />
            )}
          </Card>
        </>
      ) : (
        <EmptyState
          icon="ruler"
          message="Take waist, chest, arms, thighs and neck today — that first set becomes the baseline every later change is measured against."
        />
      )}

      <PrimaryButton
        label={hasBaseline ? 'Add a new measurement' : 'Record my baseline'}
        onPress={() => setSheetOpen(true)}
        style={{ marginTop: space.md }}
      />

      <Sheet visible={sheetOpen} title="New measurement" onClose={() => setSheetOpen(false)}>
        <Caption style={{ fontSize: 12.5, lineHeight: 18 }}>
          All five in {u.units === 'imperial' ? 'inches' : 'centimetres'}, for {formatShort(todayKey())}.
        </Caption>
        <Grid columns={2}>
          {MEASUREMENT_FIELDS.map(({ key, label }) => (
            <NumberField
              key={key}
              label={label}
              unit={u.labels.length}
              value={draft[key] ?? ''}
              onChangeText={(text) => setDraft((prev) => ({ ...prev, [key]: text }))}
            />
          ))}
        </Grid>
        <PrimaryButton label="Save measurement" onPress={submit} style={{ marginTop: space.xs }} />
      </Sheet>

      <Sheet
        visible={!!photoFor}
        title={photoFor ? `Photo · ${formatShort(photoFor.logDate)}` : 'Photo'}
        onClose={() => setPhotoFor(null)}
      >
        <Caption style={{ fontSize: 12.5, lineHeight: 18 }}>
          Saved inside the app on this device. It is never uploaded.
        </Caption>
        <PrimaryButton
          label={busy ? 'One moment…' : 'Take a photo'}
          disabled={busy}
          onPress={() => photoFor && void attach(photoFor, 'camera')}
        />
        <GhostButton
          label="Choose from library"
          onPress={() => photoFor && void attach(photoFor, 'library')}
        />
        {photoFor?.photo && (
          <GhostButton
            label="Remove this photo"
            tone="muted"
            onPress={() => setConfirmRemove(photoFor)}
          />
        )}
        <GhostButton
          label="Delete this measurement"
          tone="muted"
          onPress={() => photoFor && setConfirmDelete(photoFor)}
        />
      </Sheet>

      <ConfirmDialog
        visible={!!confirmDelete}
        title="Delete this measurement?"
        body={
          confirmDelete
            ? `${formatShort(confirmDelete.logDate)} and its five measurements go${
                confirmDelete.photo ? ', along with the photo attached to it' : ''
              }. You can undo this from the toast that follows${
                confirmDelete.photo ? " — the photo file is kept until then" : ''
              }.`
            : ''
        }
        confirmLabel="Delete it"
        destructive
        onConfirm={() => confirmDelete && deleteMeasurement(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        visible={!!confirmRemove}
        title="Remove this photo?"
        body="The file is deleted from this device. Your measurements for that day stay exactly as they are."
        confirmLabel="Remove photo"
        destructive
        onConfirm={() => confirmRemove && removePhoto(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
      />

      <Sheet visible={compareOpen} title="First and latest" onClose={() => setCompareOpen(false)}>
        {comparison && (
          <>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {[
                { label: 'First', m: comparison.before },
                { label: 'Latest', m: comparison.after },
              ].map(({ label, m }) => (
                <View key={label} style={{ flex: 1, gap: 6 }}>
                  <Image
                    source={{ uri: m.photo as string }}
                    style={{
                      width: '100%',
                      aspectRatio: 3 / 4,
                      borderRadius: radius.md,
                      backgroundColor: colors.rail,
                    }}
                    contentFit="cover"
                    accessibilityLabel={`${label} progress photo, ${formatShort(m.logDate)}`}
                  />
                  <Caption style={{ fontSize: 11, fontFamily: font.semibold }}>
                    {label} · {formatShort(m.logDate)}
                  </Caption>
                </View>
              ))}
            </View>

            <Card style={{ padding: 16, gap: 4 }}>
              <Title style={{ fontSize: 17 }}>
                {comparison.days} {comparison.days === 1 ? 'day' : 'days'} apart
              </Title>
              <Body style={{ fontSize: 13.5, lineHeight: 20 }} color={colors.muted}>
                {comparison.weightDeltaKg == null
                  ? 'No weigh-in on one of those days, so there is no weight change to show.'
                  : `Weight ${u.weightDelta(comparison.weightDeltaKg)} · waist ${u.length(
                      Math.abs(comparison.waistDeltaCm),
                    )} ${comparison.waistDeltaCm <= 0 ? 'smaller' : 'larger'}`}
              </Body>
            </Card>
          </>
        )}
      </Sheet>
    </Screen>
  );
}

/** One day's photo slot — the image itself, or a dashed prompt to add one. */
function PhotoTile({ measurement, onPress }: { measurement: Measurement; onPress: () => void }) {
  const { colors } = useTheme();
  const has = !!measurement.photo;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${has ? 'Change' : 'Add'} photo for ${formatShort(measurement.logDate)}`}
      onPress={onPress}
      style={{
        flex: 1,
        aspectRatio: 3 / 4,
        borderRadius: radius.md,
        overflow: 'hidden',
        backgroundColor: colors.rail,
        borderWidth: 1,
        borderStyle: has ? 'solid' : 'dashed',
        borderColor: colors.line,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {has ? (
        <Image
          source={{ uri: measurement.photo as string }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
        />
      ) : (
        <Icon name="camera" size={18} color={colors.muted} strokeWidth={1.4} />
      )}
      {!has && (
        <Caption style={{ fontSize: 10, fontFamily: font.semibold }}>
          {formatShort(measurement.logDate)}
        </Caption>
      )}
    </Pressable>
  );
}
