# Wouter's Portfolio Website

This repository contains my personal portfolio website built with [Hugo](https://gohugo.io/) and the [PaperMod](https://github.com/adityatelange/hugo-PaperMod) theme.

## Getting Started

### Prerequisites

- [Hugo Extended](https://gohugo.io/installation/) (v0.125.7 or higher)
- Git

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

3. Run the Hugo development server:
   ```bash
   hugo server -D
   ```

4. Visit http://localhost:1313 in your browser

## Site Structure

- `content/`: All site content organized in directories
  - `posts/`: Blog posts
  - `projects/`: Portfolio projects
  - `about/`: About me page
- `static/`: Static files like images
- `themes/PaperMod/`: The theme (installed as a git submodule)
- `hugo.yaml`: Main configuration file

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

## Deployment

This site is automatically deployed to GitHub Pages when changes are pushed to the main branch.

### Manual Deployment

1. Build the site:
   ```bash
   hugo --minify
   ```

2. Commit and push changes:
   ```bash
   git add .
   git commit -m "Your commit message"
   git push
   ```

3. GitHub Actions will automatically deploy the site to GitHub Pages

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