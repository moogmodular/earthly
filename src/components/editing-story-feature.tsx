import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk"
import { type LineString, type Point, type Polygon } from "geojson"
import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import EditingStoryMetaForm from "~/components/editing-story-meta-form"
import LineStringDisplay from "~/components/geomety-types/line-string-display"
import PointDisplay from "~/components/geomety-types/point-display"
import PolygonDisplay from "~/components/geomety-types/polygon-display"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion"
import { Badge } from "~/components/ui/badge"
import {
  CustomFeature,
  useEditingCollectionStore,
} from "~/store/edit-collection-store"
import { useNDKStore } from "~/store/ndk-store"
import { decodeNaddr } from "~/utils/naddr"
import { Button } from "./ui/button"

export const Icons = {
  spinner: Loader2,
}

export default function EditingStoryFeature({
  feature,
  rootNaddr,
}: {
  feature: CustomFeature
  rootNaddr: string
}) {
  const geometry = feature.geometry
  const featureProperties = feature.properties

  const { ndk, ndkUser } = useNDKStore()
  const { geometryCollection, setGeometry } = useEditingCollectionStore()

  const { identifier, kind, pubkey } = decodeNaddr(rootNaddr)

  const [approvalEvent, setApprovalEvent] = useState<NDKEvent>()
  const [originalEvent, setOriginalEvent] = useState<NDKEvent>()

  const fetchData = async () => {
    const approvalEvent = await ndk?.fetchEvent({
      kinds: [4550 as NDKKind],
      "#e": [featureProperties.noteId],
      "#a": [`34550:${pubkey}:${identifier}`],
    })

    const originalEvent = await ndk?.fetchEvent({
      ids: [featureProperties.noteId],
    })

    if (originalEvent) setOriginalEvent(originalEvent)
    if (approvalEvent) setApprovalEvent(approvalEvent)
  }

  useEffect(() => {
    if (ndk && rootNaddr) {
      void fetchData()
    }
  }, [ndk, rootNaddr])

  const handleFeatureMetaChange = (
    featureId: string,
    title: string,
    description: string,
  ) => {
    const newGeometryCollection = {
      ...geometryCollection,
      features: geometryCollection.features.map((feature) => {
        if (feature.properties.id === featureId) {
          return {
            ...feature,
            properties: {
              ...feature.properties,
              description: description,
              name: title,
            },
          }
        } else {
          return feature
        }
      }),
    }
    setGeometry(newGeometryCollection)
  }

  const handleFeatureApproval = async () => {
    if (ndk && ndkUser && originalEvent) {
      const now = Math.floor(Date.now() / 1000)
      const ev = await originalEvent.toNostrEvent()

      const approvalEvent = new NDKEvent(ndk, {
        kind: 4550 as NDKKind,
        pubkey: ndkUser.pubkey,
        content: JSON.stringify(ev),
        created_at: now,
        tags: [
          [
            "a",
            `34550:${ndkUser?.pubkey}:${identifier}`,
            "wss://relay.earthly.land",
          ],
          ["e", `${originalEvent?.id}`, "wss://relay.earthly.land"],
          ["p", `${ndkUser?.pubkey}`, "wss://relay.earthly.land"],
          ["k", "30333"],
        ],
      })

      const publishedApprovalEvent = await approvalEvent.publish()

      if (publishedApprovalEvent) {
        setApprovalEvent(approvalEvent)
      }
    }
  }

  return (
    <div className="flex flex-col text-xs">
      <div>{originalEvent?.id}</div>

      <div>{approvalEvent?.tagValue("e")}</div>
      <div>{feature.properties.noteId}</div>

      {!approvalEvent && (
        <Button onClick={handleFeatureApproval}>Approve this feature</Button>
      )}
      <Accordion type="single" collapsible className={"flex flex-col"}>
        <AccordionItem value="item-1">
          <AccordionTrigger className={"gap-2"}>
            <p
              className={"w-[20%] text-sm"}
              style={{ color: feature.properties.color }}
            >
              {feature.properties.color}
            </p>
            <EditingStoryMetaForm
              title={featureProperties.name}
              description={featureProperties.description}
              onChange={(title, description) =>
                handleFeatureMetaChange(
                  feature.properties.id,
                  title,
                  description,
                )
              }
            />
            <Badge className={"w-[20%]"} variant="outline">
              {geometry.type}
            </Badge>
          </AccordionTrigger>
          <AccordionContent>
            {{
              Point: <PointDisplay geometry={geometry as Point} />,
              Polygon: <PolygonDisplay geometry={geometry as Polygon} />,
              LineString: (
                <LineStringDisplay geometry={geometry as LineString} />
              ),
              GeometryCollection: <p>{geometry.type}</p>,
              MultiLineString: <p>{geometry.type}</p>,
              MultiPoint: <p>{geometry.type}</p>,
              MultiPolygon: <p>{geometry.type}</p>,
              default: <p>{geometry.type}</p>,
            }[geometry.type] ?? <p>unknown object...</p>}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}