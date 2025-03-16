# Wouter's Portfolio Website

This repository contains my personal portfolio website built with [Hugo](https://gohugo.io/) and the [PaperMod](https://github.com/adityatelange/hugo-PaperMod) theme.

## Getting Started

### Prerequisites

- [Hugo Extended](https://gohugo.io/installation/) (v0.125.7 or higher)
- Git
- Node.js and npm (for React components)

### Local Development

1. Clone this repository:
   ```bash
   git clone https://github.com/whaverals/whaverals.github.io.git
   cd whaverals.github.io
   ```

2. Update the theme submodule:
   ```bash
   git submodule update --init --recursive
   ```

3. Build the React components (optional, only if using React features):
   ```bash
   cd react-app
   npm install
   npm run build
   cd ..
   ```

4. Run the Hugo development server:
   ```bash
   hugo server -D
   ```

5. Visit http://localhost:1313 in your browser

## Site Structure

- `content/`: All site content organized in directories
  - `posts/`: Blog posts
  - `projects/`: Portfolio projects
  - `about/`: About me page
- `static/`: Static files like images
- `themes/PaperMod/`: The theme (installed as a git submodule)
- `hugo.yaml`: Main configuration file
- `react-app/`: React components (like the lanyard)

## Adding Content

### Creating a New Post

```bash
hugo new content posts/my-new-post.md
```

Then edit the file at `content/posts/my-new-post.md`.

### Creating a New Project

```bash
hugo new content projects/my-new-project.md
```

Then edit the file at `content/projects/my-new-project.md`.

## React Components

The site incorporates React components for interactive elements:

### Lanyard Component

The homepage features an interactive lanyard component built with React and Three.js. To update or modify this component:

1. Navigate to the react-app directory
2. Make changes to the src files
3. Rebuild the component with `npm run build`

## Deployment

This site is automatically deployed to GitHub Pages when changes are pushed to the main branch.

### Manual Deployment

1. Build the React components (if using):
   ```bash
   cd react-app
   npm run build
   cd ..
   ```

2. Build the site:
   ```bash
   hugo --minify
   ```

3. Commit and push changes:
   ```bash
   git add .
   git commit -m "Your commit message"
   git push
   ```

4. GitHub Actions will automatically deploy the site to GitHub Pages

## GitHub Actions Workflow

The site uses a GitHub Actions workflow (`.github/workflows/hugo.yaml`) to automatically build and deploy the site to GitHub Pages whenever changes are pushed to the main branch.

## Theme Customization

The theme is customized through the `hugo.yaml` file. Major customizations include:

- Profile mode with custom details
- Custom menu structure
- Social media links

For more theme customization options, see the [PaperMod wiki](https://github.com/adityatelange/hugo-PaperMod/wiki).

## Updating the Theme

To update the PaperMod theme:

```bash
git submodule update --remote --merge
```

## License

This project is open source and available under the [MIT License](LICENSE).