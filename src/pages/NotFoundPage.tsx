import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you're looking for doesn't exist."
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/explore">Go to Explore</Link>
        </Button>
      }
    />
  )
}
