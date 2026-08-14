import Runner from './Runner'

export default async function ProjectPage({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await params
  return <Runner project={project} />
}
