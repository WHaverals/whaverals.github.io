# Commands for Hugo Static Site

## Build & Development
- `hugo server -D` - Run development server with drafts enabled
- `hugo server --disableFastRender` - Run server with full rebuilds
- `hugo -D` - Build site with drafts
- `hugo --minify` - Build site with minification
- `hugo --gc` - Build site with garbage collection

## Content Creation
- `hugo new content posts/my-post.md` - Create new post
- `hugo new content projects/my-project.md` - Create new project page

## Theme
- PaperMod theme is used
- See [PaperMod Wiki](https://github.com/adityatelange/hugo-PaperMod/wiki) for theme documentation

## Formatting Guidelines
- Use Markdown for content files
- Front matter should be in YAML format
- Follow standard Hugo content structure
- Include appropriate front matter for each content type
- Organize content in appropriate subdirectories
- Use lowercase filenames with hyphens for spaces
- Maintain consistent image sizing and placement

## Deployment
- Site is automatically deployed to GitHub Pages on push to main branch
- GitHub Actions workflow handles the build and deployment process