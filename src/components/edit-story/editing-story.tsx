import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk"
import { type GeoJsonGeometryTypes } from "geojson"
import { Loader2, Upload } from "lucide-react"
import { useEffect, useState } from "react"
import { v4 as uuidv4 } from "uuid"
import EditingStoryForm from "~/components/edit-story/editing-story-form"
import { runtimeCollectionToNostr } from "~/mapper/collection"
import { runtimeGeometryFeatureToNostr } from "~/mapper/geometry-feature"
import {
  type EditingCollectionFormSchema,
  type UpdateCollectionFormSchema,
} from "~/models/collection"
import {
  CustomFeature,
  CustomFeatureCollection,
  FeatureReference,
  useEditingCollectionStore,
} from "~/store/edit-collection-store"
import { useNDKStore } from "~/store/ndk-store"

import { useQuery } from "@tanstack/react-query"
import { isEqual } from "lodash"
import diff from "microdiff"
import { Button } from "~/components/ui/button"
import { Label } from "~/components/ui/label"
import { Switch } from "~/components/ui/switch"
import { decodeNaddr } from "~/utils/naddr"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog"
import { toast } from "../ui/use-toast"
import GeoJsonUploadDialog from "../geo-json-upload-dialog"
import EditingStoryTable from "./edit-story-table"
import { CustomFeatureGeo } from "../map/map"
import CuratedItems from "./curated-items"

export const Icons = {
  spinner: Loader2,
}

export default function EditingStory({}) {
  const { geometryCollection, naddr, setGeometry, setGeometryFromNostr } =
    useEditingCollectionStore()
  const { ndk, ndkUser } = useNDKStore()

  const { data, error } = useQuery({
    queryKey: ["naddrEvent"],
    queryFn: async () => {
      const naddrData = decodeNaddr(naddr!)

      const res = await ndk?.fetchEvent({
        kinds: [34550 as NDKKind],
        authors: [naddrData.pubkey],
        "#d": [naddrData.identifier],
      })

      if (res) {
        setCollectionMeta({
          title: res.tagValue("title") ?? "",
          description: res.content,
          image: res.tagValue("image") ?? "",
        })
      }

      return res
    },
    enabled: Boolean(naddr),
  })

  const [iAmOwner, setIAmOwner] = useState<boolean>(false)
  const [showUnapprovedFeatures, setShowUnapprovedFeatures] =
    useState<boolean>(false)
  const [isPersisting, setIsPersisting] = useState<boolean>(false)
  const [collectionMeta, setCollectionMeta] = useState<{
    title: string
    description: string
    image: string
  }>()

  useEffect(() => {
    if (ndk && naddr) {
      void setGeometryFromNostr(naddr, showUnapprovedFeatures)
    }
  }, [showUnapprovedFeatures])

  useEffect(() => {
    if (!naddr) {
      setIAmOwner(true)
      return
    }
    const naddrData = decodeNaddr(naddr)
    setIAmOwner(ndkUser?.pubkey === naddrData.pubkey)
  }, [naddr])

  const handlePersistCollection = async (data: EditingCollectionFormSchema) => {
    if (!ndk) return
    setIsPersisting(true)

    const now = Math.floor(Date.now() / 1000)
    const motherEventId = uuidv4()

    const motherNDKEvent = new NDKEvent(
      ndk,
      runtimeCollectionToNostr({
        kind: 34550 as NDKKind,
        pubkey: ndkUser?.pubkey ?? "",
        content: data.storyDescription ?? "",
        created_at: now,
        identifier: motherEventId,
        title: data.storyTitle ?? "",
        description: data.storyDescription ?? "",
        image: `https://source.unsplash.com/random/400x200`, // TODO: implement nip-95
        published_at: now,
        authorRelay: "wss;//relay.earthly.land",
        requestsRelay: "wss://relay.earthly.land",
        approvalsRelay: "wss://relay.earthly.land",
        moderatorPubKeys: [ndkUser?.pubkey ?? ""],
      }),
    )

    const newFeatureEvents = await Promise.all(
      geometryCollection.features.map((feature) => {
        const geometry = feature.geometry as unknown as {
          coordinates: []
          type: GeoJsonGeometryTypes
        }

        if (feature.properties.isLink) {
          return new NDKEvent(ndk, {
            kind: 4326 as NDKKind,
            pubkey: ndkUser?.pubkey ?? "",
            created_at: now,
            content: JSON.stringify({
              type: "FeatureReference",
              category: `countries:${feature.properties.name}`,
              id: feature.properties.id,
              properties: {
                name: feature.properties.name,
                description: feature.properties.description,
              },
            } as FeatureReference<{}>),
            tags: [
              [
                "a",
                `34550:${ndkUser?.pubkey}:${feature.properties.id}`,
                "wss://relay.earthly.land",
              ],
              ["d", feature.properties.id],
              ["published_at", now.toString()],
              ["y", "feature"],
            ],
          })
        } else {
          return new NDKEvent(
            ndk,
            runtimeGeometryFeatureToNostr({
              kind: 4326 as NDKKind,
              pubkey: ndkUser?.pubkey ?? "",
              description: feature.properties.description,
              created_at: now,
              d: feature.properties.id,
              communityEventAuthorPubkey: ndkUser?.pubkey ?? "",
              motherEventIdentifier: motherEventId,
              published_at: now,
              name: feature.properties.name,
              color: feature.properties.color,
              type: geometry.type,
              coordinates: geometry.coordinates,
            }),
          )
        }
      }),
    )

    const newFeatureApprovals = await Promise.all(
      newFeatureEvents.map(async (event) => {
        const originalEvent = await event.toNostrEvent()
        const approvalEvent = new NDKEvent(ndk, {
          kind: 4550 as NDKKind,
          pubkey: ndkUser?.pubkey ?? "",
          content: JSON.stringify(originalEvent),
          created_at: now,
          tags: [
            [
              "a",
              `34550:${ndkUser?.pubkey}:${motherNDKEvent.tagValue("d")}`,
              "wss://relay.earthly.land",
            ],
            ["e", event.id, "wss://relay.earthly.land"],
            ["p", `${ndkUser?.pubkey}`, "wss://relay.earthly.land"],
            ["k", "4326"],
          ],
        })
        return approvalEvent
      }),
    )

    await motherNDKEvent.publish()
    await Promise.all(newFeatureEvents.map((event) => event.publish()))
    await Promise.all(newFeatureApprovals.map((event) => event.publish()))
      .then(() => {
        setIsPersisting(false)
        toast({
          title: "Event published",
          description: "Event published successfully",
        })
      })
      .catch((e) => {
        setIsPersisting(false)
        toast({
          title: "Failed to publish event",
          variant: "destructive",
          description: "Error: " + JSON.stringify(e),
        })
      })
  }

  const handleUpdateCollection = async (data: UpdateCollectionFormSchema) => {
    if (!ndk) return
    setIsPersisting(true)

    const { kind, pubkey, identifier } = decodeNaddr(data.naddr)

    const lastMotherEvent = await ndk?.fetchEvent({
      kinds: [34550 as NDKKind],
      authors: [pubkey],
      "#d": [identifier],
    })

    if (!lastMotherEvent) return

    const existingFeatureEvents = await ndk.fetchEvents({
      kinds: [4550 as NDKKind],
      authors: [
        ...lastMotherEvent
          .getMatchingTags("p")
          .map((tag) => tag[1])
          .filter((author): author is string => author !== undefined),
      ],
      "#a": [
        `34550:${lastMotherEvent.pubkey}:${lastMotherEvent.tagValue("d")}`,
      ],
    })

    const existingGeometryFeatures = Array.from(existingFeatureEvents).map(
      (event) => {
        const geoEvent = JSON.parse(event.content)
        const customFeature = JSON.parse(geoEvent.content) as CustomFeature
        delete customFeature.properties.noteId
        return customFeature
      },
    )

    const newFeatures = geometryCollection.features.filter((feature) => {
      return !existingGeometryFeatures.some((existingFeature) =>
        existingFeature.properties.id === feature.properties.id ? true : false,
      )
    })

    const editedFeatures = geometryCollection.features.filter((feature) => {
      const targetFeature = existingGeometryFeatures.find((existingFeature) => {
        return feature.properties.id === existingFeature.properties.id
      })
      if (!targetFeature) return false
      return !isEqual(feature, targetFeature)
    })

    // const lodashDiff = geometryCollection.features.filter((feature) => {
    //   return !existingGeometryFeatures.some((existingFeature) =>
    //     isEqual(feature, existingFeature),
    //   )
    // })

    // const singleElementDiffs = lodashDiff.map((diffFeature) => {
    //   const targetFeature = existingGeometryFeatures.find((existingFeature) => {
    //     return diffFeature.properties.id === existingFeature.properties.id
    //   })
    //   if (!targetFeature) return
    //   return {
    //     index: existingGeometryFeatures.indexOf(targetFeature),
    //     diff: diff(diffFeature, targetFeature),
    //   }
    // })

    setIsPersisting(false)
  }

  const handleSubmitGeometryChanges = async () => {
    if (!ndk || !naddr) return
    setIsPersisting(true)

    const { kind, pubkey, identifier } = decodeNaddr(naddr)

    const lastMotherEvent = await ndk?.fetchEvent({
      kinds: [kind as NDKKind],
      // authors: [pubkey],
      "#d": [identifier],
    })

    if (!lastMotherEvent) return

    const existingFeatureEvents = await ndk.fetchEvents({
      kinds: [4550 as NDKKind],
      authors: [
        ...lastMotherEvent
          .getMatchingTags("p")
          .map((tag) => tag[1])
          .filter((author): author is string => author !== undefined),
      ],
      "#a": [
        `34550:${lastMotherEvent.pubkey}:${lastMotherEvent.tagValue("d")}`,
      ],
    })

    const arrExistingFeatureEvents = await Promise.all(
      Array.from(existingFeatureEvents).map(async (ev) => {
        const resolvedGeometryEvent = await ndk.fetchEvent({
          ids: [ev.tagValue("e") ?? ""],
        })
        if (!resolvedGeometryEvent) return
        return JSON.parse(resolvedGeometryEvent?.content) as CustomFeature
      }),
    )

    const newAndChangedFeatures = geometryCollection.features
      .map((feature) => {
        const existingFeature = arrExistingFeatureEvents.find(
          (existingFeature) => {
            if (!existingFeature) return false
            return existingFeature?.properties.id === feature.properties.id
          },
        )

        if (!existingFeature) return feature

        const hasDiff = diff(feature, existingFeature as any).length > 0

        if (hasDiff) {
          return feature
        } else {
          return
        }
      })
      .filter((e) => e !== undefined) as CustomFeature[]

    const now = Math.floor(Date.now() / 1000)

    const newAndChangedEvents = newAndChangedFeatures.map((feature) => {
      const geometry = feature.geometry as unknown as {
        coordinates: []
        type: GeoJsonGeometryTypes
      }

      return new NDKEvent(
        ndk,
        runtimeGeometryFeatureToNostr({
          kind: 4326 as NDKKind,
          pubkey: ndkUser?.pubkey ?? "",
          description: feature.properties.description,
          created_at: now,
          d: feature.properties.id,
          communityEventAuthorPubkey: lastMotherEvent.pubkey ?? "",
          motherEventIdentifier: lastMotherEvent.tagValue("d") ?? "",
          published_at: now,
          name: feature.properties.name,
          color: feature.properties.color,
          type: geometry.type,
          coordinates: geometry.coordinates,
        }),
      )
    })

    await Promise.all(newAndChangedEvents.map((event) => event.publish()))
    setIsPersisting(false)
  }

  const onDiscard = () => {
    console.log("discard")
  }

  const handleGroupItems = (ids: string[]) => {
    const groupedFeatures = ids.reduce((grouped: any, id) => {
      const feature = geometryCollection.features.find(
        (feature) => feature.properties.id === id,
      )

      if (feature) {
        const { type, coordinates, geometry } =
          feature.geometry as unknown as CustomFeatureGeo & { coordinates: [] }
        const multiType = `Multi${type.charAt(0).toUpperCase() + type.slice(1)}`

        if (!grouped[multiType]) {
          grouped[multiType] = {
            type: "Feature",
            geometry: {
              type: multiType,
              coordinates: [coordinates],
            },
            properties: feature.properties,
          }
        } else {
          grouped[multiType].geometry.coordinates.push(coordinates)
        }
      }

      return grouped
    }, {})

    const newGeometry = Object.values(groupedFeatures)

    console.log(newGeometry)

    setGeometry({
      ...geometryCollection,
      features: [
        ...geometryCollection.features.filter(
          (feature) => !ids.includes(feature.properties.id),
        ),
        ...newGeometry,
      ],
    } as CustomFeatureCollection)
  }

  const handleSplitItems = (id: string) => {
    const newFeatures = geometryCollection.features.reduce(
      (features: any, feature) => {
        const geometry = feature.geometry as unknown as { coordinates: [] }
        if (id === feature.properties.id) {
          const singleType = feature.geometry.type.slice(5)
          geometry.coordinates.forEach((coordinate: any) => {
            features.push({
              type: "Feature",
              geometry: {
                type: singleType,
                coordinates: coordinate,
              },
              properties: { ...feature.properties, id: uuidv4() },
            })
          })
        } else {
          features.push(feature)
        }

        return features
      },
      [],
    )

    setGeometry({
      ...geometryCollection,
      features: newFeatures,
    })
  }

  return (
    <div>
      {geometryCollection.features.length > 0 ? (
        <div className={"flex flex-col rounded-lg border p-4"}>
          <div className="flex items-center space-x-2">
            <Dialog>
              <DialogTrigger asChild>
                <Upload className="h-4 w-4" />
              </DialogTrigger>
              <DialogContent className="min-w-[80vw]">
                <DialogHeader>
                  <DialogTitle>Upload geojson</DialogTitle>
                  <DialogDescription>
                    Make sure the file is formatted properly
                  </DialogDescription>
                </DialogHeader>
                <GeoJsonUploadDialog />
                <DialogFooter>
                  <Button type="submit">Save changes</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Switch
              id="show-unapproved-features"
              defaultChecked={false}
              onCheckedChange={(checked) => setShowUnapprovedFeatures(checked)}
            />
            <Label htmlFor="show-unapproved-features">
              Show unapproved features
            </Label>
          </div>
          {iAmOwner ? (
            <EditingStoryForm
              onSubmit={handlePersistCollection}
              onUpdateCollectionData={handleUpdateCollection}
              onDiscard={onDiscard}
              naddr={naddr}
            />
          ) : (
            <div className={"flex flex-col gap-2"}>
              <b>{collectionMeta?.title}</b>
              <div>{collectionMeta?.description}</div>
            </div>
          )}

          <EditingStoryTable
            tableData={geometryCollection}
            gorupItems={handleGroupItems}
            splitItems={handleSplitItems}
          />
          <CuratedItems />

          {/* <div className={"flex flex-col"}>
            {geometryCollection.features.map((feature, index) => {
              return (
                <EditingStoryFeature
                  key={feature.properties.id}
                  feature={feature}
                  rootNaddr={naddr ?? ""}
                />
              )
            })}
          </div> */}
          {naddr && (
            <Button onClick={handleSubmitGeometryChanges}>
              Submit changes
            </Button>
          )}
          {isPersisting && <Icons.spinner className="h-4 w-4 animate-spin" />}
        </div>
      ) : null}
    </div>
  )
}
