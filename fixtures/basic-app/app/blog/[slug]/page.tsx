export async function generateStaticParams() {
  return [{ slug: "hello" }, { slug: "world" }];
}

export default function BlogPost({ params }: { params: { slug: string } }) {
  return <h1>{params.slug}</h1>;
}
