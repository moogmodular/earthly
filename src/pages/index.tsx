import Head from "next/head";
import dynamic from "next/dynamic";
import {useEffect} from "react";
import {Layout} from "~/pages/layout";
import EditingStory from "~/pages/components/editing-story";
import {useNDKStore} from "~/store/ndk-store";
import RecentStories from "~/pages/components/recent-stories";
import {getPublicKey} from "nostr-tools";
import {useRecentCollectionsStore} from "~/store/recent-collections-store";

const Map = dynamic(() => import("./components/map"), { ssr: false });

export default function Home() {
  const { initAnonymous } = useNDKStore();
  const { init: recentCollectionInit, collections } =
    useRecentCollectionsStore();

  useEffect(() => {
    const initAll = async () => {
      await initAnonymous();
      await recentCollectionInit();
    };
    void initAll();
  }, []);

  return (
    <>
      <Head>
        <title>earthly</title>
        <meta name="description" content="Generated by create-t3-app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Layout>
        <main className="flex flex-grow flex-row overflow-auto">
          <div className="flex w-2/5 flex-col gap-2 overflow-y-scroll p-4">
            <EditingStory />
            <RecentStories />
          </div>
          <div className="flex w-3/5 flex-col p-4">
            <Map />
          </div>
        </main>
      </Layout>
    </>
  );
}
